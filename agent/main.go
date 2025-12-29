package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"
)

const (
	scanInterval           = 10 * time.Second
	defaultScanTimeout     = 500 * time.Millisecond
	defaultRetryTimeout    = 1500 * time.Millisecond
	defaultRetryDelay      = 25 * time.Millisecond
	defaultScanRetries     = 1
	progressUpdateInterval = 1 * time.Second
	defaultWorkerCount     = 500
	maxPort                = 65535
	dbMaxConns             = 1
)

var (
	connString      = os.Getenv("DATABASE_URL") // Changed to var
	scanTimeout     = defaultScanTimeout
	scanRetryTimeout = defaultRetryTimeout
	scanRetryDelay  = defaultRetryDelay
	scanRetries     = defaultScanRetries
	workerCount     = defaultWorkerCount
)

type Server struct {
	ID int
	IP string
}

type Settings struct {
	ScanEnabled         bool
	ScanIntervalMinutes int
	ScanConcurrency     int
}

type scanJob struct {
	scanID     int
	serverID   int
	totalPorts int
}

func main() {
	if connString == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}

	scanTimeout = envDurationMS("SCAN_TIMEOUT_MS", defaultScanTimeout)
	scanRetryTimeout = envDurationMS("SCAN_RETRY_TIMEOUT_MS", defaultRetryTimeout)
	scanRetryDelay = envDurationMS("SCAN_RETRY_DELAY_MS", defaultRetryDelay)
	scanRetries = envInt("SCAN_RETRIES", defaultScanRetries)
	workerCount = envInt("SCAN_WORKERS", defaultWorkerCount)

	db, err := sql.Open("sqlite", connString)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	db.SetMaxOpenConns(dbMaxConns)
	db.SetMaxIdleConns(dbMaxConns)

	if err := db.PingContext(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}

	if _, err := db.Exec(`PRAGMA journal_mode = WAL;`); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to enable WAL mode: %v\n", err)
		os.Exit(1)
	}
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000;`); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to set busy timeout: %v\n", err)
		os.Exit(1)
	}

	ticker := time.NewTicker(scanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ctx := context.Background()
			settings, err := getSettings(ctx, db)
			if err != nil {
				fmt.Printf("Error loading settings: %v\n", err)
				continue
			}

			if err := enqueuePeriodicScans(ctx, db, settings); err != nil {
				fmt.Printf("Error scheduling periodic scans: %v\n", err)
			}

			processScans(ctx, db, settings)
		}
	}
}

func processScans(ctx context.Context, db *sql.DB, settings Settings) {
	rows, err := db.QueryContext(ctx, `SELECT id, "serverId", "totalPorts" FROM "Scan" WHERE status IN ('queued', 'scanning') ORDER BY "createdAt" ASC`)
	if err != nil {
		fmt.Printf("Error fetching scans: %v\n", err)
		return
	}

	var jobs []scanJob
	for rows.Next() {
		var job scanJob
		if err := rows.Scan(&job.scanID, &job.serverID, &job.totalPorts); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}
		jobs = append(jobs, job)
	}

	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating scans: %v\n", err)
	}
	_ = rows.Close()

	concurrency := settings.ScanConcurrency
	if concurrency < 1 {
		concurrency = 1
	}

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, job := range jobs {
		sem <- struct{}{}
		wg.Add(1)
		go func(job scanJob) {
			defer wg.Done()
			defer func() { <-sem }()

			processScanJob(ctx, db, job)
		}(job)
	}

	wg.Wait()
}

func processScanJob(ctx context.Context, db *sql.DB, job scanJob) {
	var server Server
	err := db.QueryRowContext(ctx,
		`SELECT id, ip FROM "Server" WHERE id = ?`, job.serverID).Scan(&server.ID, &server.IP)
	if err != nil {
		fmt.Printf("Error fetching server %d: %v\n", job.serverID, err)
		return
	}

	totalPorts := job.totalPorts
	if totalPorts <= 0 {
		totalPorts = maxPort
	}

	if err := markScanStarted(ctx, db, job.scanID); err != nil {
		fmt.Printf("Error marking scan %d as started: %v\n", job.scanID, err)
		return
	}

	openPorts, canceled := scanPorts(server.IP, totalPorts, func(scanned, open int) bool {
		if err := updateScanProgress(ctx, db, job.scanID, scanned, open); err != nil {
			fmt.Printf("Error updating scan progress %d: %v\n", job.scanID, err)
		}
		isCanceled, err := isScanCanceled(ctx, db, job.scanID)
		if err != nil {
			fmt.Printf("Error checking scan cancel status %d: %v\n", job.scanID, err)
			return false
		}
		return isCanceled
	})

	if canceled {
		if err := markScanCanceled(ctx, db, job.scanID); err != nil {
			fmt.Printf("Error marking scan %d as canceled: %v\n", job.scanID, err)
		}
		return
	}

	if err := savePorts(db, server.ID, openPorts); err != nil {
		fmt.Printf("Error saving ports: %v\n", err)
		if markErr := markScanError(ctx, db, job.scanID, err.Error()); markErr != nil {
			fmt.Printf("Error marking scan %d as failed: %v\n", job.scanID, markErr)
		}
		return
	}

	if err := markScanDone(ctx, db, job.scanID, totalPorts, len(openPorts)); err != nil {
		fmt.Printf("Error marking scan %d as done: %v\n", job.scanID, err)
	}
}

func scanPorts(ip string, totalPorts int, onProgress func(scanned int, open int) bool) ([]int, bool) {
	workerTotal := workerCount
	if workerTotal < 1 {
		workerTotal = 1
	}
	if totalPorts > 0 && workerTotal > totalPorts {
		workerTotal = totalPorts
	}

	ports := make(chan int, workerTotal*4)
	results := make(chan int, workerTotal*2)
	var openPorts []int
	var wg sync.WaitGroup
	var scanned atomic.Int64
	var openCount atomic.Int64
	var canceled atomic.Bool
	cancelCh := make(chan struct{})
	var cancelOnce sync.Once
	done := make(chan struct{})

	cancelScan := func() {
		cancelOnce.Do(func() {
			canceled.Store(true)
			close(cancelCh)
		})
	}

	if onProgress != nil {
		go func() {
			ticker := time.NewTicker(progressUpdateInterval)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					if onProgress(int(scanned.Load()), int(openCount.Load())) {
						cancelScan()
					}
				case <-done:
					if onProgress(int(scanned.Load()), int(openCount.Load())) {
						cancelScan()
					}
					return
				case <-cancelCh:
					return
				}
			}
		}()
	}

	// Start workers
	for i := 0; i < workerTotal; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			dialer := &net.Dialer{
				Timeout:   scanTimeout,
				KeepAlive: -1,
			}
			for port := range ports {
				if canceled.Load() {
					return
				}
				if dialPort(dialer, ip, port, canceled.Load) {
					openCount.Add(1)
					select {
					case results <- port:
					case <-cancelCh:
						return
					}
				}
				scanned.Add(1)
			}
		}()
	}

	// Send ports to workers
	go func() {
		for port := 1; port <= totalPorts; port++ {
			select {
			case <-cancelCh:
				close(ports)
				return
			case ports <- port:
			}
		}
		close(ports)
	}()

	// Close results channel when done
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	for port := range results {
		openPorts = append(openPorts, port)
	}
	close(done)

	sort.Ints(openPorts)
	return openPorts, canceled.Load()
}

func dialPort(dialer *net.Dialer, ip string, port int, isCanceled func() bool) bool {
	address := net.JoinHostPort(ip, strconv.Itoa(port))
	timeout := scanTimeout

	for attempt := 0; attempt <= scanRetries; attempt++ {
		if isCanceled() {
			return false
		}

		dialer.Timeout = timeout
		conn, err := dialer.Dial("tcp", address)
		if err == nil {
			conn.Close()
			return true
		}

		if attempt < scanRetries && shouldRetry(err) {
			timeout = scanRetryTimeout
			if scanRetryDelay > 0 {
				time.Sleep(scanRetryDelay)
			}
			continue
		}

		return false
	}

	return false
}

func shouldRetry(err error) bool {
	var netErr net.Error
	if errors.As(err, &netErr) {
		if netErr.Timeout() || netErr.Temporary() {
			return true
		}
	}

	message := strings.ToLower(err.Error())
	if strings.Contains(message, "too many open files") ||
		strings.Contains(message, "cannot assign requested address") ||
		strings.Contains(message, "resource temporarily unavailable") ||
		strings.Contains(message, "address already in use") {
		return true
	}

	return false
}

func savePorts(db *sql.DB, serverID int, ports []int) error {
	ctx := context.Background()

	existingPorts := make(map[int]struct{})
	rows, err := db.QueryContext(ctx, `SELECT port FROM "Port" WHERE "serverId" = ?`, serverID)
	if err != nil {
		return fmt.Errorf("error querying existing ports: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err != nil {
			return fmt.Errorf("error scanning port: %w", err)
		}
		existingPorts[port] = struct{}{}
	}

	var newPorts []int
	for _, port := range ports {
		if _, exists := existingPorts[port]; !exists {
			newPorts = append(newPorts, port)
		}
	}

	if len(newPorts) == 0 {
		return nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error starting transaction: %w", err)
	}

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO "Port" ("serverId", port) VALUES (?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("error preparing insert: %w", err)
	}
	defer stmt.Close()

	for _, port := range newPorts {
		if _, err := stmt.ExecContext(ctx, serverID, port); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("batch insert error: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error committing insert: %w", err)
	}

	return nil
}

func markScanStarted(ctx context.Context, db *sql.DB, scanID int) error {
	_, err := db.ExecContext(ctx, `UPDATE "Scan" SET status = 'scanning', "startedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, scanID)
	return err
}

func updateScanProgress(ctx context.Context, db *sql.DB, scanID int, scanned int, open int) error {
	_, err := db.ExecContext(ctx, `UPDATE "Scan" SET "scannedPorts" = ?, "openPorts" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, scanned, open, scanID)
	return err
}

func markScanDone(ctx context.Context, db *sql.DB, scanID int, totalPorts int, open int) error {
	_, err := db.ExecContext(ctx, `UPDATE "Scan" SET status = 'done', "scannedPorts" = ?, "openPorts" = ?, "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, totalPorts, open, scanID)
	return err
}

func markScanError(ctx context.Context, db *sql.DB, scanID int, message string) error {
	_, err := db.ExecContext(ctx, `UPDATE "Scan" SET status = 'error', error = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, message, scanID)
	return err
}

func markScanCanceled(ctx context.Context, db *sql.DB, scanID int) error {
	_, err := db.ExecContext(ctx, `UPDATE "Scan" SET status = 'canceled', "finishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, scanID)
	return err
}

func isScanCanceled(ctx context.Context, db *sql.DB, scanID int) (bool, error) {
	var status string
	err := db.QueryRowContext(ctx, `SELECT status FROM "Scan" WHERE id = ?`, scanID).Scan(&status)
	if err != nil {
		return false, err
	}
	return status == "canceled", nil
}

func getSettings(ctx context.Context, db *sql.DB) (Settings, error) {
	var scanEnabledInt int
	var intervalMinutes int
	var concurrency int

	err := db.QueryRowContext(ctx, `SELECT "scanEnabled", "scanIntervalMinutes", "scanConcurrency" FROM "Settings" ORDER BY id ASC LIMIT 1`).Scan(&scanEnabledInt, &intervalMinutes, &concurrency)
	if err == sql.ErrNoRows {
		_, insertErr := db.ExecContext(ctx, `INSERT INTO "Settings" ("scanEnabled", "scanIntervalMinutes", "scanConcurrency") VALUES (1, 1440, 2)`)
		if insertErr != nil {
			return Settings{}, insertErr
		}
		err = db.QueryRowContext(ctx, `SELECT "scanEnabled", "scanIntervalMinutes", "scanConcurrency" FROM "Settings" ORDER BY id ASC LIMIT 1`).Scan(&scanEnabledInt, &intervalMinutes, &concurrency)
	}
	if err != nil {
		return Settings{}, err
	}

	if intervalMinutes < 1 {
		intervalMinutes = 1
	}
	if concurrency < 1 {
		concurrency = 1
	}

	return Settings{
		ScanEnabled:         scanEnabledInt != 0,
		ScanIntervalMinutes: intervalMinutes,
		ScanConcurrency:     concurrency,
	}, nil
}

func enqueuePeriodicScans(ctx context.Context, db *sql.DB, settings Settings) error {
	if !settings.ScanEnabled {
		return nil
	}

	interval := time.Duration(settings.ScanIntervalMinutes) * time.Minute
	if interval <= 0 {
		return nil
	}

	query := `
SELECT s.id, MAX(CAST(strftime('%s', sc."finishedAt") AS INTEGER)) AS lastScanEpoch
FROM "Server" s
LEFT JOIN "Scan" sc ON sc."serverId" = s.id AND sc.status = 'done'
GROUP BY s.id`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now()
	type scheduleCandidate struct {
		serverID      int
		lastScanEpoch sql.NullInt64
	}
	var candidates []scheduleCandidate
	for rows.Next() {
		var serverID int
		var lastScanEpoch sql.NullInt64
		if err := rows.Scan(&serverID, &lastScanEpoch); err != nil {
			return err
		}

		candidates = append(candidates, scheduleCandidate{
			serverID:      serverID,
			lastScanEpoch: lastScanEpoch,
		})
	}

	if err := rows.Err(); err != nil {
		return err
	}

	_ = rows.Close()

	for _, candidate := range candidates {
		if candidate.lastScanEpoch.Valid {
			lastScanTime := time.Unix(candidate.lastScanEpoch.Int64, 0)
			if now.Sub(lastScanTime) < interval {
				continue
			}
		}

		active, err := hasActiveScan(ctx, db, candidate.serverID)
		if err != nil {
			return err
		}
		if active {
			continue
		}

		if err := enqueueScan(ctx, db, candidate.serverID, maxPort); err != nil {
			return err
		}
	}

	return nil
}

func hasActiveScan(ctx context.Context, db *sql.DB, serverID int) (bool, error) {
	var exists int
	err := db.QueryRowContext(ctx, `SELECT 1 FROM "Scan" WHERE "serverId" = ? AND status IN ('queued', 'scanning') LIMIT 1`, serverID).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func enqueueScan(ctx context.Context, db *sql.DB, serverID int, totalPorts int) error {
	_, err := db.ExecContext(ctx, `INSERT INTO "Scan" ("serverId", status, "totalPorts", "scannedPorts", "openPorts") VALUES (?, 'queued', ?, 0, 0)`, serverID, totalPorts)
	return err
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envDurationMS(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return time.Duration(parsed) * time.Millisecond
}
