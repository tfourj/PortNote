"use client";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

type AgentStatus = "healthy" | "unhealthy" | "unknown";

type NavbarProps = {
    onOpenConfig?: () => void;
    agentStatus?: AgentStatus;
};

export default function Navbar({ onOpenConfig, agentStatus = "unknown" }: NavbarProps){
    const router = useRouter()
    const statusLabel =
        agentStatus === "healthy"
            ? "Agent online"
            : agentStatus === "unhealthy"
            ? "Agent offline"
            : "Agent checking";
    const statusClass =
        agentStatus === "healthy"
            ? "badge-success"
            : agentStatus === "unhealthy"
            ? "badge-error"
            : "badge-ghost";

    const logout = async () => {
        Cookies.remove("token")
        router.push("/")
    }

    return(
        <div className="navbar bg-base-200 shadow-sm">
            <div className="navbar-start">
                <a className="btn btn-ghost text-xl">PortNote</a>
            </div>
            <div className="navbar-center hidden lg:flex">
            </div>
            <div className="navbar-end gap-2">
                <span className={`badge ${statusClass}`} aria-label={statusLabel} aria-live="polite">
                    {statusLabel}
                </span>
                <button
                    className="btn btn-soft"
                    onClick={() => onOpenConfig?.()}
                    aria-label="Open configuration"
                >
                    <Settings className="h-4 w-4" />
                    Config
                </button>
                <a className="btn btn-soft btn-error" onClick={logout}>Logout</a>
            </div>
        </div>
    )
}
