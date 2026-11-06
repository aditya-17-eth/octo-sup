import Link from "next/link";
export default function NotFound() { return <div className="page narrow"><h1>Signal not found.</h1><p className="muted">This page or mission is unavailable.</p><Link className="button button-primary" href="/missions">Browse missions</Link></div>; }
