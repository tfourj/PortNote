"use client";
import Navbar from "@/components/Navbar";
import ErrorToast from "@/components/Error";
import { Edit, Plus, Trash, Dice5, Copy, ScanSearch, ChevronRight, Settings, ListChecks } from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
import axios from "axios";
import Fuse from "fuse.js";
import Footer from "@/components/Footer"
import Cookies from "js-cookie";
import { SortType, Server, Port } from "@/app/types";
import { compareIp } from "@/app/utils";

type ScanStatus = "queued" | "scanning" | "done" | "error" | "missing" | "canceled";

interface ScanProgress {
  scanId: number;
  serverId: number;
  status: ScanStatus;
  scannedPorts: number;
  totalPorts: number;
  openPorts: number;
  error?: string | null;
}

interface ActiveScanResponse {
  scans: {
    id: number;
    serverId: number;
    status: ScanStatus;
    scannedPorts: number;
    totalPorts: number;
    openPorts: number;
    error?: string | null;
  }[];
}

interface SettingsResponse {
  scanEnabled: boolean;
  scanIntervalMinutes: number;
  scanConcurrency: number;
  lastScanAt?: string | null;
  totalServers?: number;
  scannedServers?: number;
  activeScansCount?: number;
}

interface CleanupPort {
  id: number;
  serverId: number;
  port: number;
  note?: string | null;
  serverName?: string | null;
  serverHostId?: number | null;
  hostName?: string | null;
}

export default function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showError, setShowError] = useState(false);
  const [error, setError] = useState("");

  const [sortType, setSortType] = useState<SortType>(() => {
    if (typeof window !== 'undefined') {
      return (Cookies.get('serverSort') as SortType) || SortType.Alphabet;
    }
    return SortType.Alphabet;
  });

  const [expanded, setExpanded] = useState<Set<number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = Cookies.get('expanded');
      return new Set(saved ? JSON.parse(saved) : []);
    }
    return new Set();
  });
  // Form States
  const [isVm, setIsVm] = useState(false);
  const [type, setType] = useState(0);
  const [serverName, setServerName] = useState("");
  const [serverIP, setServerIP] = useState("");
  const [serverHost, setServerHost] = useState<number | null>(null);
  const [portServer, setPortServer] = useState<number | null>(null);
  const [portNote, setPortNote] = useState("");
  const [portPort, setPortPort] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<Server | Port | null>(null);

  const [randomPort, setRandomPort] = useState<number | null>(null);
  const [showRandomModal, setShowRandomModal] = useState(false);

  const [isScanDetailOpen, setIsScanDetailOpen] = useState(false);
  const [isAllScansOpen, setIsAllScansOpen] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [activeScans, setActiveScans] = useState<ScanProgress[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [scanEnabledSetting, setScanEnabledSetting] = useState(true);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState(1440);
  const [scanConcurrency, setScanConcurrency] = useState(2);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [totalServersCount, setTotalServersCount] = useState(0);
  const [scannedServersCount, setScannedServersCount] = useState(0);
  const [activeScansCount, setActiveScansCount] = useState(0);
  const activeScanIdsRef = useRef<Set<number>>(new Set());
  const [isCleanPortsOpen, setIsCleanPortsOpen] = useState(false);
  const [portsToClean, setPortsToClean] = useState<CleanupPort[]>([]);
  const [isCleanPortsLoading, setIsCleanPortsLoading] = useState(false);
  const [dismissedDownPortsKey, setDismissedDownPortsKey] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return Cookies.get("dismissedDownPortsKey") ?? null;
    }
    return null;
  });


  useEffect(() => {
    Cookies.set('expanded', JSON.stringify(Array.from(expanded)), {
      expires: 365,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }, [expanded]);

  useEffect(() => {
    Cookies.set('serverSort', sortType, { expires: 365, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' });
  }, [sortType]);

  useEffect(() => {
    if (!dismissedDownPortsKey) {
      Cookies.remove("dismissedDownPortsKey");
      return;
    }
    Cookies.set("dismissedDownPortsKey", dismissedDownPortsKey, {
      expires: 365,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production"
    });
  }, [dismissedDownPortsKey]);

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const fuse = useMemo(() => new Fuse(servers, {
    keys: ['name', 'ip', 'ports.note', 'ports.port'],
    threshold: 0.3,
    includeScore: true
  }), [servers]);
  
  const filteredServers = useMemo(() => {
    if (!searchQuery) return servers;
  
    const isNumericQuery = /^\d+$/.test(searchQuery);
    if (isNumericQuery) {
      const portNumber = parseInt(searchQuery, 10);
      return servers.filter(server => 
        server.ports.some(port => port.port === portNumber)
      );
    }
  
    return fuse.search(searchQuery).map(result => result.item);
  }, [searchQuery, servers, fuse]);

  const fetchData = async () => {
    try {
      const response = await axios.get<Server[]>("/api/get");
      setServers(response.data);
    } catch (error: any) {
      handleError("Error loading data: " + error.message);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await axios.get<SettingsResponse>("/api/settings");
      setScanEnabledSetting(response.data.scanEnabled);
      setScanIntervalMinutes(response.data.scanIntervalMinutes);
      setScanConcurrency(response.data.scanConcurrency);
      setLastScanAt(response.data.lastScanAt ?? null);
      setTotalServersCount(response.data.totalServers ?? 0);
      setScannedServersCount(response.data.scannedServers ?? 0);
      setActiveScansCount(response.data.activeScansCount ?? 0);
    } catch (error: any) {
      handleError("Failed to load settings: " + error.message);
    }
  };

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loadActiveScans = async () => {
      try {
        const response = await axios.get<ActiveScanResponse>("/api/scan/active");
        if (cancelled) {
          return;
        }
        const scans = response.data.scans || [];
        const nextIds = new Set(scans.map((scan) => scan.id));
        let endedScan = false;
        const activeScanIds = activeScanIdsRef.current;

        activeScanIds.forEach((id) => {
          if (!nextIds.has(id)) {
            endedScan = true;
          }
        });

        setActiveScans(
          scans.map((scan) => ({
            scanId: scan.id,
            serverId: scan.serverId,
            status: scan.status,
            scannedPorts: scan.scannedPorts,
            totalPorts: scan.totalPorts,
            openPorts: scan.openPorts,
            error: scan.error
          }))
        );
        activeScanIdsRef.current = nextIds;

        if (endedScan) {
          fetchData();
        }

        if (selectedScanId && !nextIds.has(selectedScanId)) {
          setIsScanDetailOpen(false);
          setSelectedScanId(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          handleError("Failed to load scan status: " + error.message);
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(loadActiveScans, 2000);
        }
      }
    };

    loadActiveScans();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [selectedScanId]);

  const handleError = (message: string) => {
    setError(message);
    setShowError(true);
  };

  const handleSaveSettings = async () => {
    try {
      await axios.put("/api/settings", {
        scanEnabled: scanEnabledSetting,
        scanIntervalMinutes,
        scanConcurrency
      });
      setIsSettingsOpen(false);
    } catch (error: any) {
      handleError("Failed to save settings: " + error.message);
    }
  };

  const handleRunPeriodicScan = async () => {
    try {
      await axios.post("/api/scan/run-periodic");
      loadSettings();
    } catch (error: any) {
      handleError("Failed to queue scans: " + error.message);
    }
  };

  const handleOpenCleanPorts = async () => {
    setIsCleanPortsLoading(true);
    try {
      const response = await axios.get<{ ports: CleanupPort[] }>("/api/ports/cleanup");
      setPortsToClean(response.data.ports ?? []);
      setIsCleanPortsOpen(true);
      setIsSettingsOpen(false);
    } catch (error: any) {
      handleError("Failed to load ports for cleanup: " + error.message);
    } finally {
      setIsCleanPortsLoading(false);
    }
  };

  const handleConfirmCleanPorts = async () => {
    if (portsToClean.length === 0) {
      setIsCleanPortsOpen(false);
      return;
    }

    setIsCleanPortsLoading(true);
    try {
      await axios.post("/api/ports/cleanup", { ids: portsToClean.map((port) => port.id) });
      setIsCleanPortsOpen(false);
      setPortsToClean([]);
      await fetchData();
    } catch (error: any) {
      handleError("Failed to clean ports: " + error.message);
    } finally {
      setIsCleanPortsLoading(false);
    }
  };

  const hostServers = useMemo(() => {
    const list = filteredServers.filter(s => s.host === null);
    return list.sort((a, b) => {
      if (sortType === SortType.IP) {
        return a.ip.localeCompare(b.ip, undefined, { numeric: true });
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredServers, sortType]);

  // Group & sort VMs under hosts
  const vmsByHost = useMemo(() => {
    const map: Record<number, Server[]> = {};
    filteredServers.forEach(s => {
      if (s.host !== null) {
        map[s.host] = map[s.host] || [];
        map[s.host].push(s);
      }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      if (sortType === SortType.IP) return compareIp(a.ip, b.ip);
      return a.name.localeCompare(b.name);
    }));
    return map;
  }, [filteredServers, sortType]);

  const visibleServerIds = useMemo(
    () => filteredServers.map((server) => server.id),
    [filteredServers]
  );

  const allVisibleExpanded = useMemo(() => {
    if (visibleServerIds.length === 0) {
      return false;
    }
    return visibleServerIds.every((id) => expanded.has(id));
  }, [visibleServerIds, expanded]);

  const handleExpandAll = () => {
    setExpanded(new Set(visibleServerIds));
  };

  const handleCollapseAll = () => {
    setExpanded(new Set());
  };

  const validateForm = () => {
    if (type === 0) {
      if (!serverName.trim() || !serverIP.trim()) {
        handleError("Name and IP are required");
        return false;
      }
    } else {
      if (!portServer || !portPort) {
        handleError("Server and port are required");
        return false;
      }

      if (usedPorts.has(portPort)) {
        handleError("Port is already in use");
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const payload = type === 0 ? {
        type,
        serverName,
        serverIP,
        serverHost: isVm ? serverHost : null
      } : {
        type,
        portServer,
        portNote,
        portPort
      };

      await axios.post("/api/add", payload);
      await fetchData();
      (document.getElementById('add') as HTMLDialogElement)?.close();
      resetForm();
    } catch (error: any) {
      handleError("Creation failed: " + error.message);
    }
  };

  const handleDelete = async (type: number, id: number) => {
    try {
      await axios.delete("/api/delete", { data: { type, id } });
      await fetchData();
    } catch (error: any) {
      handleError("Deletion failed: " + error.message);
    }
  };

  const handleEdit = async () => {
    if (!editItem) return;
    
    try {
      const payload = "ports" in editItem ? {
        type: 0,
        id: editItem.id,
        data: {
          name: editItem.name,
          ip: editItem.ip,
          host: editItem.host
        }
      } : {
        type: 1,
        id: editItem.id,
        data: {
          note: editItem.note,
          port: editItem.port
        }
      };

      await axios.put("/api/edit", payload);
      await fetchData();
      (document.getElementById('edit') as HTMLDialogElement)?.close();
      setEditItem(null);
    } catch (error: any) {
      handleError("Update failed: " + error.message);
    }
  };

  const activeScanByServerId = useMemo(() => {
    const map = new Map<number, ScanProgress>();
    activeScans.forEach((scan) => {
      if (scan.status === "queued" || scan.status === "scanning") {
        map.set(scan.serverId, scan);
      }
    });
    return map;
  }, [activeScans]);

  const isScanActive = activeScans.length > 0;
  const isScanActiveForServer = (id: number) => activeScanByServerId.has(id);

  const handleScan = async (id: number) => {
    try {
      setIsScanDetailOpen(true);
      const payload = { serverId: id };
      const response = await axios.post<{ scanId: number }>("/api/scan", payload);
      setSelectedScanId(response.data.scanId);
      setActiveScans((prev) => {
        const filtered = prev.filter((scan) => scan.serverId !== id);
        return [
          ...filtered,
          {
            scanId: response.data.scanId,
            serverId: id,
            status: "queued",
            scannedPorts: 0,
            totalPorts: 65535,
            openPorts: 0
          }
        ];
      });
    } catch (error: any) {
      handleError("Scan failed: " + error.message);
      setIsScanDetailOpen(false);
      setSelectedScanId(null);
      setActiveScans([]);
    }
  };

  const handleScanButtonClick = (id: number) => {
    const activeScan = activeScanByServerId.get(id);
    if (activeScan) {
      setSelectedScanId(activeScan.scanId);
      setIsScanDetailOpen(true);
      return;
    }

    handleScan(id);
  };

  const handleCancelScan = async (scanId: number) => {
    if (!scanId) {
      return;
    }

    try {
      await axios.post("/api/scan/cancel", { scanId });
    } catch (error: any) {
      handleError("Cancel failed: " + error.message);
    }
  };

  const resetForm = () => {
    setType(0);
    setServerName("");
    setServerIP("");
    setIsVm(false);
    setServerHost(null);
    setPortServer(null);
    setPortNote("");
    setPortPort(null);
  };

  const handleAddPortForServer = (serverId: number) => {
    setType(1);
    setPortServer(serverId);
    setPortNote("");
    setPortPort(null);
    (document.getElementById('add') as HTMLDialogElement)?.showModal();
  };

  const handleAddVmForHost = (hostId: number) => {
    setType(0);
    setServerName("");
    setServerIP("");
    setIsVm(true);
    setServerHost(hostId);
    (document.getElementById('add') as HTMLDialogElement)?.showModal();
  };

const usedPorts = useMemo(() => {
  const ports = new Set<number>();
  servers.forEach(server => {
    server.ports.forEach(port => ports.add(port.port));
  });
  return ports;
}, [servers]);

const generateRandomPort = () => {
  let port;
  let attempts = 0;
  
  do {
    port = Math.floor(Math.random() * (65535 - 1024) + 1024);
    attempts++;
  } while (usedPorts.has(port) && attempts < 1000);

  if (attempts >= 1000) {
    handleError("Could not find free port after 1000 attempts");
    return;
  }

  setRandomPort(port);
  setShowRandomModal(true);
};

  const copyToClipboard = () => {
    if (randomPort !== null) {
     navigator.clipboard.writeText(randomPort.toString());
    }
};

  const sortedPorts = (ports: Port[]) => 
    [...ports].sort((a, b) => a.port - b.port);

  const getScanStatusLabel = (status?: ScanStatus) => {
    switch (status) {
      case "done":
        return "Scan complete";
      case "canceled":
        return "Scan canceled";
      case "error":
        return "Scan failed";
      case "missing":
        return "Scan not found";
      case "scanning":
        return "Scanning ports...";
      case "queued":
        return "Queued for scan...";
      default:
        return "Scan status unknown";
    }
  };

  const getServerName = (serverId: number) => {
    const server = servers.find((item) => item.id === serverId);
    return server ? server.name : `Server ${serverId}`;
  };

  const getCleanupServerLabel = (item: CleanupPort) => {
    if (item.serverHostId) {
      const hostLabel = item.hostName ? ` (Host: ${item.hostName})` : "";
      return `VM: ${item.serverName ?? `Server ${item.serverId}`}${hostLabel}`;
    }
    return `Host: ${item.serverName ?? `Server ${item.serverId}`}`;
  };

  const isPortDown = (port: Port) => {
    if (!port.lastCheckedAt) {
      return false;
    }
    if (!port.lastSeenAt) {
      return true;
    }
    return new Date(port.lastSeenAt).getTime() < new Date(port.lastCheckedAt).getTime();
  };

  const selectedScan = useMemo(() => {
    if (!selectedScanId) {
      return null;
    }
    return activeScans.find((scan) => scan.scanId === selectedScanId) ?? null;
  }, [activeScans, selectedScanId]);

  const selectedScanPercent = selectedScan?.totalPorts
    ? Math.min(100, Math.round((selectedScan.scannedPorts / selectedScan.totalPorts) * 100))
    : 0;

  const downPortsInfo = useMemo(() => {
    const serverIds = new Set<number>();
    const downPortIds: number[] = [];
    let total = 0;
    servers.forEach((server) => {
      server.ports.forEach((port) => {
        if (isPortDown(port)) {
          total += 1;
          serverIds.add(server.id);
          downPortIds.push(port.id);
        }
      });
    });
    downPortIds.sort((a, b) => a - b);
    return { total, serverIds, key: downPortIds.join(",") };
  }, [servers]);

  useEffect(() => {
    if (downPortsInfo.total === 0) {
      setDismissedDownPortsKey(null);
      return;
    }
    if (dismissedDownPortsKey && dismissedDownPortsKey !== downPortsInfo.key) {
      setDismissedDownPortsKey(null);
    }
  }, [downPortsInfo, dismissedDownPortsKey]);

  const handleExpandDownPorts = () => {
    setExpanded((prev) => {
      const next = new Set(prev);
      downPortsInfo.serverIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const nextScanAt = useMemo(() => {
    if (!scanEnabledSetting || !lastScanAt) {
      return null;
    }
    const last = new Date(lastScanAt);
    if (Number.isNaN(last.getTime())) {
      return null;
    }
    return new Date(last.getTime() + scanIntervalMinutes * 60 * 1000);
  }, [scanEnabledSetting, lastScanAt, scanIntervalMinutes]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <ErrorToast
        message={error}
        show={showError}
        onClose={() => setShowError(false)}
      />
{isScanDetailOpen && (
        <dialog className="modal modal-open" aria-labelledby="scan-detail-title">
          <div className="modal-box">
            <div className="flex flex-col items-center justify-center gap-4" id="scan-detail-title">
              {selectedScan ? (
                <>
                  {(selectedScan.status === "queued" || selectedScan.status === "scanning") && (
                    <span className="loading loading-spinner text-primary loading-lg"></span>
                  )}
                  <p className="text-center">{getScanStatusLabel(selectedScan.status)}</p>
                  {selectedScan.status === "queued" || selectedScan.status === "scanning" ? (
                    <p className="text-center text-xs opacity-70">You can close this window. The scan keeps running in the background.</p>
                  ) : null}
                  <div className="w-full space-y-2">
                    <progress className="progress progress-primary w-full" value={selectedScanPercent} max="100"></progress>
                    <div className="flex justify-between text-xs opacity-70">
                      <span>
                        {selectedScan.scannedPorts.toLocaleString()} / {selectedScan.totalPorts.toLocaleString()} ports scanned
                      </span>
                      <span>{selectedScanPercent}%</span>
                    </div>
                    <div className="text-xs opacity-70">
                      Open ports found: {selectedScan.openPorts.toLocaleString()}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-center text-sm">Scan is no longer active.</p>
              )}
            </div>
            <div className="modal-action">
              {selectedScan && (selectedScan.status === "queued" || selectedScan.status === "scanning") && (
                <button
                  className="btn btn-error"
                  onClick={() => handleCancelScan(selectedScan.scanId)}
                  aria-label="Cancel scan"
                >
                  Cancel
                </button>
              )}
              <button
                className="btn"
                onClick={() => {
                  setIsScanDetailOpen(false);
                  setSelectedScanId(null);
                }}
                aria-label="Close scan dialog"
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      )}
{isAllScansOpen && (
        <dialog className="modal modal-open" aria-labelledby="modal-title">
          <div className="modal-box">
            <div className="flex flex-col gap-4" id="modal-title">
              <div className="flex items-center gap-2">
                {activeScans.length > 0 && (
                  <span className="loading loading-spinner text-primary loading-md"></span>
                )}
                <p className="text-sm opacity-70">
                  {activeScans.length > 0 ? "Scans running in the background." : "Background port scans"}
                </p>
              </div>
              <div className="space-y-3">
                {activeScans.length === 0 ? (
                  <p className="text-center text-sm">No active scans.</p>
                ) : (
                  activeScans.map((scan) => {
                    const percent = scan.totalPorts
                      ? Math.min(100, Math.round((scan.scannedPorts / scan.totalPorts) * 100))
                      : 0;
                    return (
                      <div key={scan.scanId} className="rounded-lg border border-base-300 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{getServerName(scan.serverId)}</div>
                          <span className="text-xs opacity-70">{getScanStatusLabel(scan.status)}</span>
                        </div>
                        <progress className="progress progress-primary w-full" value={percent} max="100"></progress>
                        <div className="flex justify-between text-xs opacity-70">
                          <span>
                            {scan.scannedPorts.toLocaleString()} / {scan.totalPorts.toLocaleString()} ports scanned
                          </span>
                          <span>{percent}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs opacity-70">
                          <span>Open ports found: {scan.openPorts.toLocaleString()}</span>
                          <button
                            className="btn btn-xs btn-error"
                            onClick={() => handleCancelScan(scan.scanId)}
                            aria-label={`Cancel scan for ${getServerName(scan.serverId)}`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => setIsAllScansOpen(false)}
                aria-label="Close scan dialog"
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      )}
{isSettingsOpen && (
        <dialog className="modal modal-open" aria-labelledby="settings-title">
          <div className="modal-box">
            <h3 className="font-bold text-lg pb-2" id="settings-title">Scan Settings</h3>
            <div className="space-y-4">
              <label className="label cursor-pointer">
                <span className="label-text">Enable periodic scans</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={scanEnabledSetting}
                  onChange={(event) => setScanEnabledSetting(event.target.checked)}
                />
              </label>
              <div className="space-y-1">
                <label className="label">
                  <span className="label-text">Scan interval (minutes)</span>
                </label>
                <input
                  type="number"
                  className="input w-full"
                  min={1}
                  max={1440}
                  value={scanIntervalMinutes}
                  onChange={(event) => setScanIntervalMinutes(Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="label">
                  <span className="label-text">Concurrent scans</span>
                </label>
                <input
                  type="number"
                  className="input w-full"
                  min={1}
                  max={10}
                  value={scanConcurrency}
                  onChange={(event) => setScanConcurrency(Number(event.target.value))}
                />
              </div>
              <div className="text-xs opacity-70">
                Last scan: {lastScanAt ? new Date(lastScanAt).toLocaleString() : "Never"}
              </div>
              {scanEnabledSetting && (
                <div className="text-xs opacity-70">
                  Next scan: {nextScanAt ? nextScanAt.toLocaleString() : "Waiting for first interval"}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs opacity-70">
                {activeScansCount > 0 && (
                  <span className="loading loading-spinner loading-xs"></span>
                )}
                <span>
                  {activeScansCount > 0 ? "Periodic scans running" : "Periodic scans idle"}
                </span>
              </div>
              <div className="text-xs opacity-70">
                Scanned {scannedServersCount}/{totalServersCount} servers in the last interval
              </div>
              <p className="text-xs opacity-70">Periodic scans are queued and run in the background.</p>
            </div>
            <div className="modal-action">
              <button
                className="btn"
                onClick={handleOpenCleanPorts}
                aria-label="Clean closed ports"
                disabled={isCleanPortsLoading}
              >
                {isCleanPortsLoading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  "Clean closed ports"
                )}
              </button>
              <button className="btn" onClick={handleRunPeriodicScan} aria-label="Queue periodic scan now">Run now</button>
              <button className="btn btn-primary" onClick={handleSaveSettings} aria-label="Save scan settings">Save</button>
              <button className="btn" onClick={() => setIsSettingsOpen(false)} aria-label="Close scan settings">Close</button>
            </div>
          </div>
        </dialog>
      )}
{isCleanPortsOpen && (
        <dialog className="modal modal-open" aria-labelledby="clean-ports-title">
          <div className="modal-box">
            <h3 className="font-bold text-lg pb-2" id="clean-ports-title">Clean Closed Ports</h3>
            <div className="space-y-3">
              {portsToClean.length === 0 ? (
                <p className="text-sm opacity-70">No closed ports found from the latest scans.</p>
              ) : (
                <>
                  <p className="text-sm opacity-70">
                    The following ports were not seen open in the latest scan and will be removed.
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2 border border-base-300 rounded-lg p-3">
                    {portsToClean.map((item) => (
                      <div key={item.id} className="text-sm flex items-start justify-between gap-2">
                        <span className="font-medium">{getCleanupServerLabel(item)}</span>
                        <span className="text-xs opacity-70">
                          Port {item.port}
                          {item.note ? ` • ${item.note}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-action">
              <button
                className="btn btn-error"
                onClick={handleConfirmCleanPorts}
                aria-label="Confirm clean closed ports"
                disabled={isCleanPortsLoading || portsToClean.length === 0}
              >
                {isCleanPortsLoading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  `Remove ${portsToClean.length} ports`
                )}
              </button>
              <button
                className="btn"
                onClick={() => setIsCleanPortsOpen(false)}
                aria-label="Close clean ports dialog"
                disabled={isCleanPortsLoading}
              >
                Close
              </button>
            </div>
          </div>
        </dialog>
      )}
      <div className="grid grid-cols-12 pt-12">
        <div className="col-start-3 col-end-11" role="main" aria-label="Server and port management">
          {downPortsInfo.total > 0 && dismissedDownPortsKey !== downPortsInfo.key && (
            <div className="alert alert-warning mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <span className="text-sm">
                  {downPortsInfo.total} ports were not found in the latest scan.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-sm"
                    onClick={handleExpandDownPorts}
                    aria-label="Show devices with closed ports"
                  >
                    Show affected devices
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setDismissedDownPortsKey(downPortsInfo.key)}
                    aria-label="Dismiss closed ports warning"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="w-full flex gap-2">
            <select
                value={sortType}
                onChange={e => setSortType(e.target.value as SortType)}
                className="select select-bordered w-48"
                aria-label="Sort servers by"
            >
              <option value={SortType.Alphabet}>Sort: Alphabetical</option>
              <option value={SortType.IP}>Sort: IP Address</option>
            </select>
            <label className="input w-full ">
              <svg className="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <g
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                    fill="none"
                    stroke="currentColor"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.3-4.3"></path>
                </g>
              </svg>
              <input
                  type="text"
                  placeholder="Search..."
                  className="input input-lg outline-none focus:outline-none focus:ring-0 border-0 focus:border-0"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search servers and ports"
              />
            </label>

            <button 
                className="btn btn-square"
                onClick={generateRandomPort}
                title="Generate random port"
                aria-label="Generate random port"
            >
              <Dice5/>
            </button>
            <button
                className="btn btn-square"
                onClick={() => setIsSettingsOpen(true)}
                title="Scan settings"
                aria-label="Open scan settings"
            >
              <Settings />
            </button>
            <button
                className="btn btn-square"
                onClick={() => setIsAllScansOpen(true)}
                title="Active scans"
                aria-label="View active scans"
            >
              <ListChecks />
            </button>
            {showRandomModal && randomPort !== null && (
                <dialog open className="modal" aria-label="Random port generated">
                  <div className="modal-box max-w-xs space-y-4" role="dialog" aria-labelledby="random-port-title">
                    <div className="text-center">
                      <h3 className="font-bold text-xl mb-1" id="random-port-title">Random Port Generator</h3>
                      <p className="text-sm opacity-75">Your allocated port number</p>
                    </div>

                    <div className="bg-base-200 rounded-box p-4 w-full text-center shadow-inner">
                        <span className="text-4xl font-mono font-bold tracking-wider">
                        {randomPort}
                        </span>
                    </div>

                    <div className="flex flex-col w-full gap-2">
                      <button
                          className="btn btn-block gap-2"
                          onClick={copyToClipboard}
                          title="Copy port"
                          aria-label="Copy port number to clipboard"
                      >
                        <Copy size={18} className="mr-1"/>
                        Copy Port
                      </button>

                      <button
                          className="btn btn-ghost btn-sm btn-circle absolute top-2 right-2"
                          onClick={() => setShowRandomModal(false)}
                          title="Close"
                          aria-label="Close random port dialog"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </dialog>
            )}

            <button 
                className="btn btn-square"
                onClick={() => (document.getElementById('add') as HTMLDialogElement)?.showModal()}
                aria-label="Add new server or port"
            >
              <Plus/>
            </button>

            {/* Add Dialog */}
            <dialog id="add" className="modal">
              <div className="modal-box">
                <h3 className="font-bold text-lg pb-2" id="add-dialog-title">Add...</h3>
                <div className="tabs tabs-box">
                  <input
                      type="radio"
                      name="type"
                      className="tab"
                      aria-label="Server"
                      checked={type === 0}
                      onChange={() => setType(0)}
                  />
                  <div className="tab-content bg-base-100 border-base-300 p-6 space-y-2">
                    <input
                        type="text"
                        placeholder="Name"
                        className="input w-full"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        required
                    />
                    <input
                        type="text"
                        placeholder="IP"
                        className="input w-full"
                        value={serverIP}
                        onChange={(e) => setServerIP(e.target.value)}
                        required
                    />
                    <div className="flex gap-2 items-center">
                      <label className="label cursor-pointer">
                        <span className="label-text">Is VM?</span>
                        <input
                            type="checkbox"
                            className="checkbox"
                            checked={isVm}
                            onChange={(e) => setIsVm(e.target.checked)}
                        />
                      </label>
                      {isVm && (
                          <select
                              className="select select-bordered w-full"
                              value={serverHost || ""}
                              onChange={(e) => setServerHost(Number(e.target.value))}
                              required
                          >
                            <option disabled value="">Select host</option>
                            {hostServers.map(server => (
                                <option key={server.id} value={server.id}>
                                  {server.name}
                                </option>
                            ))}
                          </select>
                      )}
                    </div>
                  </div>

                  <input
                      type="radio"
                      name="type"
                      className="tab"
                      aria-label="Port"
                      checked={type === 1}
                      onChange={() => setType(1)}
                  />
                  <div className="tab-content bg-base-100 border-base-300 p-6 space-y-2">
                    <select
                        className="select w-full"
                        value={portServer || ""}
                        onChange={(e) => setPortServer(Number(e.target.value))}
                        required
                    >
                      <option disabled value="">Select server</option>
                      {servers.map(server => (
                          <option key={server.id} value={server.id}>
                            {server.name}
                          </option>
                      ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Note"
                        className="input w-full"
                        value={portNote}
                        onChange={(e) => setPortNote(e.target.value)}
                    />
                    <input
                        type="number"
                        placeholder="Port"
                        className="input w-full"
                        value={portPort || ""}
                        onChange={(e) => setPortPort(Number(e.target.value))}
                        min="0"
                        max="65535"
                        required
                    />
                  </div>
                </div>
                <div className="modal-action mt-auto pt-2">
                  <button className="btn" onClick={handleSubmit} aria-label="Add new item">Add</button>
                  <button className="btn btn-ghost"
                          onClick={() => (document.getElementById('add') as HTMLDialogElement)?.close()}
                          aria-label="Cancel adding new item">
                    Cancel
                  </button>
                </div>
              </div>
            </dialog>

            {/* Edit Dialog */}
            <dialog id="edit" className="modal">
              <div className="modal-box">
                <h3 className="font-bold text-lg pb-2" id="edit-dialog-title">{editItem && "ports" in editItem ? "Edit Server" : "Edit Port"}</h3>
                {editItem && (
                    <div className="space-y-4">
                      {"ports" in editItem ? (
                          <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Name"
                                className="input w-full"
                                value={editItem.name}
                                onChange={(e) => setEditItem({...editItem, name: e.target.value})}
                                required
                            />
                            <input
                                type="text"
                                placeholder="IP"
                                className="input w-full"
                                value={editItem.ip}
                                onChange={(e) => setEditItem({...editItem, ip: e.target.value})}
                                required
                            />
                            <div className="flex gap-2 items-center">
                              <label className="label cursor-pointer">
                                <span className="label-text">Is VM?</span>
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={!!editItem.host}
                                    onChange={(e) => {
                                      const isVmChecked = e.target.checked;
                                      if (isVmChecked) {
                                        // Get available hosts excluding the current server
                                        const availableHosts = hostServers.filter(s => s.id !== editItem.id);
                                        const newHost = availableHosts.length > 0 ? availableHosts[0].id : null;
                                        setEditItem({
                                          ...editItem,
                                          host: newHost
                                        });
                                      } else {
                                        setEditItem({
                                          ...editItem,
                                          host: null
                                        });
                                      }
                                    }}

                                />
                              </label>
                              {editItem.host !== null && (
                                  <select
                                      className="select select-bordered w-full"
                                      value={editItem.host}
                                      onChange={(e) => setEditItem({
                                        ...editItem,
                                        host: Number(e.target.value)
                                      })}
                                      required
                                  >
                                    <option disabled value="">Select host</option>
                                    {hostServers
                                        .filter(server => server.id !== editItem.id) // Exclude current server
                                        .map(server => (
                                            <option key={server.id} value={server.id}>
                                              {server.name}
                                            </option>
                                        ))}
                                  </select>
                              )}
                            </div>
                          </div>
                      ) : (
                          <div className="space-y-2">
                            <select
                                className="select w-full"
                                value={editItem.serverId}
                                onChange={(e) => setEditItem({
                                  ...editItem,
                                  serverId: Number(e.target.value)
                                })}
                                required
                            >
                              {servers.map(server => (
                                  <option key={server.id} value={server.id}>
                                    {server.name}
                                  </option>
                              ))}
                            </select>
                            <input
                                type="text"
                                placeholder="Note"
                                className="input w-full"
                                value={editItem.note || ""}
                                onChange={(e) => setEditItem({
                                  ...editItem,
                                  note: e.target.value
                                })}
                            />
                            <input
                                type="number"
                                placeholder="Port"
                                className="input w-full"
                                value={editItem.port}
                                onChange={(e) => setEditItem({
                                  ...editItem,
                                  port: Number(e.target.value)
                                })}
                                min="0"
                                max="65535"
                                required
                            />
                          </div>
                      )}
                      <div className="modal-action">
                        <button className="btn" onClick={handleEdit} aria-label="Save edited item">Save</button>
                        <button className="btn btn-ghost" onClick={() => {
                          (document.getElementById('edit') as HTMLDialogElement)?.close();
                          setEditItem(null);
                        }}
                        aria-label="Cancel editing item">
                          Cancel
                        </button>
                      </div>
                    </div>
                )}
              </div>
            </dialog>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Server list controls">
            <button
              className="btn btn-sm"
              onClick={handleExpandAll}
              disabled={visibleServerIds.length === 0 || allVisibleExpanded}
              aria-label="Expand all servers and VMs"
            >
              Expand all
            </button>
            <button
              className="btn btn-sm"
              onClick={handleCollapseAll}
              disabled={expanded.size === 0}
              aria-label="Collapse all servers and VMs"
            >
              Collapse all
            </button>
          </div>

          {/* Server List */}
          <div className="mt-8 space-y-4" role="list" aria-label="Server list">
            {hostServers.map(server => (
                <div key={server.id} className="bg-base-200 p-4 rounded-lg" role="listitem" aria-label={`Server ${server.name}`}>
                  <div className="flex items-center gap-2">
                    <button
                        className="btn btn-ghost btn-xs p-1"
                        onClick={() => toggleExpanded(server.id)}
                        aria-label={expanded.has(server.id) ? `Collapse server ${server.name}` : `Expand server ${server.name}`}
                        aria-expanded={expanded.has(server.id)}
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${
                          expanded.has(server.id) ? 'rotate-90' : ''
                      }`} />
                    </button>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="font-bold text-lg">{server.name}</div>
                    <button
                      className="btn btn-xs btn-ghost text-primary"
                      onClick={() => handleScanButtonClick(server.id)}
                      aria-label={`Scan ports for server ${server.name}`}
                    >
                      {isScanActiveForServer(server.id) ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                        <ScanSearch size={14} />
                      )}
                    </button>
                  </div>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleAddVmForHost(server.id)}
                    aria-label={`Add VM for host ${server.name}`}
                    title={`Add VM for ${server.name}`}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      setEditItem(server);
                      (document.getElementById('edit') as HTMLDialogElement)?.showModal();
                    }}
                    aria-label={`Edit server ${server.name}`}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    className="btn btn-xs btn-ghost text-error"
                    onClick={() => handleDelete(0, server.id)}
                    aria-label={`Delete server ${server.name}`}
                  >
                    <Trash size={14} />
                  </button>
                </div>
                <div className="text-sm opacity-75">{server.ip}</div>
                  {expanded.has(server.id) && (
                    <div className="ml-4 mt-2 bg-base-100 rounded-xl p-3 shadow-sm" role="region" aria-label={`Ports for server ${server.name}`}>
                      <div className="text-xs font-medium mb-2 text-base-content/70">PORTS</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {sortedPorts(server.ports).map(port => {
                          const portDown = isPortDown(port);
                          return (
                            <div
                              key={port.id}
                              className={`flex items-center gap-2 p-2 hover:bg-base-200 rounded-lg transition-colors border ${portDown ? "border-error/60 bg-error/5" : "border-base-300"}`}
                              role="listitem"
                              aria-label={`Port ${port.port}${port.note ? `, ${port.note}` : ""}${portDown ? ", down" : ""}`}
                            >
                              <div
                                className={`badge w-16 shrink-0 hover:bg-primary hover:text-primary-content cursor-pointer ${portDown ? "badge-error" : "badge-neutral"}`}
                                onClick={() => {window.open(`http://${server.ip}:${port.port}`, "_blank")}}
                                aria-label={`Open port ${port.port}`}
                              >
                                {port.port}
                              </div>
                              <span className="text-sm flex-1 truncate">{port.note}</span>
                              <div className="flex gap-1">
                                <button
                                  className="btn btn-xs btn-ghost"
                                  onClick={() => {
                                    setEditItem(port);
                                    (document.getElementById("edit") as HTMLDialogElement)?.showModal();
                                  }}
                                  aria-label={`Edit port ${port.port}`}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  className="btn btn-xs btn-ghost text-error"
                                  onClick={() => handleDelete(2, port.id)}
                                  aria-label={`Delete port ${port.port}`}
                                >
                                  <Trash size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {vmsByHost[server.id]?.map(vm => (
                      <div key={vm.id} className="ml-4 mt-4 border-l-2 pl-4" role="listitem" aria-label={`Virtual machine ${vm.name}`}>
                        <div className="flex items-center gap-2">
                          <button
                              className="btn btn-ghost btn-xs p-1"
                              onClick={() => toggleExpanded(vm.id)}
                              aria-label={expanded.has(vm.id) ? `Collapse VM ${vm.name}` : `Expand VM ${vm.name}`}
                              aria-expanded={expanded.has(vm.id)}
                          >
                            <ChevronRight className={`h-4 w-4 transition-transform ${
                                expanded.has(vm.id) ? 'rotate-90' : ''
                            }`} />
                          </button>
                      <div className="font-medium">🖥️ {vm.name}</div>
                      <button
                    className="btn btn-xs btn-ghost text-primary"
                    onClick={() => handleScanButtonClick(vm.id)}
                    aria-label={`Scan ports for VM ${vm.name}`}
                  >
                    {isScanActiveForServer(vm.id) ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      <ScanSearch size={14} />
                    )}
                  </button>
                  <div className="ml-auto flex gap-2">
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => handleAddPortForServer(vm.id)}
                          aria-label={`Add port for VM ${vm.name}`}
                          title={`Add port for ${vm.name}`}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => {
                            setEditItem(vm);
                            (document.getElementById('edit') as HTMLDialogElement)?.showModal();
                          }}
                          aria-label={`Edit VM ${vm.name}`}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          className="btn btn-xs btn-ghost text-error"
                          onClick={() => handleDelete(1, vm.id)}
                          aria-label={`Delete VM ${vm.name}`}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm opacity-75">{vm.ip}</div>
                        {expanded.has(vm.id) && (
                          <div className="ml-4 mt-2 bg-base-100 rounded-xl p-3 shadow-sm" role="region" aria-label={`Ports for VM ${vm.name}`}>
                            <div className="text-xs font-medium mb-2 text-base-content/70">PORTS</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2" role="list" aria-label={`Port list for ${vm.name}`}>
                              {sortedPorts(vm.ports).map(port => {
                                const portDown = isPortDown(port);
                                return (
                                  <div
                                    key={port.id}
                                    className={`flex items-center gap-2 p-2 hover:bg-base-200 rounded-lg transition-colors border ${portDown ? "border-error/60 bg-error/5" : "border-base-300"}`}
                                    role="listitem"
                                    aria-label={`Port ${port.port}${port.note ? `, ${port.note}` : ""}${portDown ? ", down" : ""}`}
                                  >
                                    <div
                                      className={`badge w-16 shrink-0 hover:bg-primary hover:text-primary-content cursor-pointer ${portDown ? "badge-error" : "badge-neutral"}`}
                                      onClick={() => {window.open(`http://${vm.ip}:${port.port}`, "_blank")}}
                                      aria-label={`Open port ${port.port}`}
                                    >
                                      {port.port}
                                    </div>
                                    <span className="text-sm flex-1 truncate">{port.note}</span>
                                    <div className="flex gap-1">
                                      <button
                                        className="btn btn-xs btn-ghost"
                                        onClick={() => {
                                          setEditItem(port);
                                          (document.getElementById("edit") as HTMLDialogElement)?.showModal();
                                        }}
                                        aria-label={`Edit port ${port.port}`}
                                      >
                                        <Edit size={14} />
                                      </button>
                                      <button
                                        className="btn btn-xs btn-ghost text-error"
                                        onClick={() => handleDelete(2, port.id)}
                                        aria-label={`Delete port ${port.port}`}
                                      >
                                        <Trash size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
