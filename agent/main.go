package main

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"os"
	"sort"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	scanInterval = 10 * time.Second
	scanTimeout  = 750 * time.Millisecond
	workerCount  = 2000
	maxPort      = 65535
	dbMaxConns   = 1
)

var (
	connString = os.Getenv("DATABASE_URL") // Changed to var
)

type Server struct {
	ID int
	IP string
}

func main() {
	if connString == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}

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
			processScans(db)
		}
	}
}

func processScans(db *sql.DB) {
	ctx := context.Background()

	rows, err := db.QueryContext(ctx, `SELECT "serverId" FROM "Scan"`)
	if err != nil {
		fmt.Printf("Error fetching scans: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var serverID int
		if err := rows.Scan(&serverID); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}

		var server Server
		err := db.QueryRowContext(ctx,
			`SELECT id, ip FROM "Server" WHERE id = ?`, serverID).Scan(&server.ID, &server.IP)
		if err != nil {
			fmt.Printf("Error fetching server %d: %v\n", serverID, err)
			continue
		}

		openPorts := scanPorts(server.IP)

		if err := savePorts(db, server.ID, openPorts); err != nil {
			fmt.Printf("Error saving ports: %v\n", err)
			continue
		}

		_, err = db.ExecContext(ctx, `DELETE FROM "Scan" WHERE "serverId" = ?`, serverID)
		if err != nil {
			fmt.Printf("Error deleting scan entry: %v\n", err)
		}
	}

	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating scans: %v\n", err)
	}
}

func scanPorts(ip string) []int {
	ports := make(chan int, 10000)
	results := make(chan int)
	var openPorts []int
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range ports {
				conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), scanTimeout)
				if err == nil {
					conn.Close()
					results <- port
				}
			}
		}()
	}

	// Send ports to workers
	go func() {
		for port := 1; port <= maxPort; port++ {
			ports <- port
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

	sort.Ints(openPorts)
	return openPorts
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
