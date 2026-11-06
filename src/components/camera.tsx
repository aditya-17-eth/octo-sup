"use client";
import { useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, CameraOff } from "lucide-react";
import { Button } from "./ui/button";
export function Camera({ onCapture }: { onCapture: (file: File | null) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false), [preview, setPreview] = useState(""), [error, setError] = useState("");
  useEffect(() => () => { stream.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function start() { setError(""); onCapture(null); setPreview(""); try { stream.current?.getTracks().forEach(t => t.stop()); stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } }, audio: false }); setActive(true); if (video.current) { video.current.srcObject = stream.current; await video.current.play(); } } catch { setError("Camera access is unavailable. Use HTTPS or localhost and allow camera access."); setActive(false); stream.current?.getTracks().forEach(t => t.stop()); } }
  function capture() { const el = video.current; if (!el || !el.videoWidth) return; const canvas = document.createElement("canvas"); canvas.width = el.videoWidth; canvas.height = el.videoHeight; canvas.getContext("2d")!.drawImage(el, 0, 0); canvas.toBlob(blob => { if (blob) { const file = new File([blob], "capture.jpg", { type: "image/jpeg" }); setPreview(URL.createObjectURL(file)); onCapture(file); stream.current?.getTracks().forEach(t => t.stop()); setActive(false); } }, "image/jpeg", .9); }
  return <div className="stack"><video ref={video} className="camera" hidden={!active} playsInline muted/>{preview && <img className="camera" src={preview} alt="Your captured evidence, before private submission"/>}<div className="row"><Button variant="outline" type="button" onClick={start}><CameraIcon size={16}/>{preview ? "Retake photo" : "Open camera"}</Button>{active && <Button type="button" onClick={capture}>Capture evidence</Button>}</div>{error && <p className="notice error"><CameraOff size={15}/>{error}</p>}</div>;
}
