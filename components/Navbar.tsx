"use client";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

type NavbarProps = {
    onOpenConfig?: () => void;
};

export default function Navbar({ onOpenConfig }: NavbarProps){
    const router = useRouter()

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
