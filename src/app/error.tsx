"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="page narrow"><h1>Connection interrupted.</h1><p className="notice error">The request failed. Check the server configuration and try again.</p><button className="button button-primary" onClick={reset}>Try again</button></div>; }
