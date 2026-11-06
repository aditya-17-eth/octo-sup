import Link from "next/link";
import { Plus } from "lucide-react";
import { MissionFeed } from "@/components/mission-feed";
export default function Missions() { return <div className="page"><div className="page-title"><div><span className="eyebrow">Mission control</span><h1>A question. A human. A signal.</h1><p>Commission fresh observations from the physical world.</p></div><Link href="/missions/new" className="button button-primary"><Plus size={17}/> Create mission</Link></div><MissionFeed/></div>; }
