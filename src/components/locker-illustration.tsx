"use client";

import { useState, useEffect } from "react";
import { Cloud } from "lucide-react";

export default function LockerIllustration({ hideIdCard }: { hideIdCard?: boolean }) {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => (t >= 56 ? 0 : t + 1));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const showPhone = timer >= 13 && timer < 55;
  const autoOpen = timer >= 30 && timer < 55;
  const showIdCard = !hideIdCard && timer < 55;
  const doorOpen = autoOpen;
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#f7f6f3] to-[#edebe7] scale-100 md:scale-125"
      style={{ perspective: "1000px", transformStyle: "preserve-3d" }}>
      {/* Floating particles with 3D depth */}
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {Array.from({ length: 180 }, (_, i) => {
          const a = i * 97.3, b = i * 53.7, c = i * 141.1;
          return {
            l: ((a * 1.7 + b * 0.3) % 96) + 2,
            t: ((b * 2.3 + c * 0.7) % 94) + 3,
            d: ((a + b) % 4) + 2,
            c: (i % 5) < 3 ? "#355C8A" : "#7FB8B5",
            o: 0.06 + ((a + c) % 20) * 0.012,
            z: ((a * 1.3 + c * 0.5) % 80) - 40,
          };
        }).map((dot, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${dot.d}px`,
              height: `${dot.d}px`,
              backgroundColor: dot.c,
              left: `${dot.l}%`,
              top: `${dot.t}%`,
              animation: `float3d 12s ease-in-out ${i * 0.3}s infinite`,
              opacity: dot.o,
              transform: `translateZ(${dot.z}px) rotateX(${i * 3}deg)`,
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          />
        ))}
      </div>

      {/* IoT nodes with 3D float */}
      <div className="absolute" style={{ top: "12%", right: "12%", transform: "translateZ(40px)" }}>
          <div style={{ animation: "float3d 15s ease-in-out 1s infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          <Cloud size={44} className="text-[#355C8A]" style={{ opacity: 0.35 }} />
        </div>
      </div>
      <div className="absolute" style={{ top: "15%", right: "22%", transform: "translateZ(20px)" }}>
        <div style={{ animation: "float3d 18s ease-in-out 1.5s infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          <Cloud size={28} className="text-[#7FB8B5]" style={{ opacity: 0.2 }} />
        </div>
      </div>
      <div className="absolute" style={{ top: "10%", left: "18%", transform: "translateZ(30px)" }}>
        <div style={{ animation: "float3d 14s ease-in-out 0.5s infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          <Cloud size={36} className="text-[#355C8A]" style={{ opacity: 0.25 }} />
        </div>
      </div>
      <div className="absolute" style={{ top: "18%", left: "8%", transform: "translateZ(10px)" }}>
        <div style={{ animation: "float3d 16s ease-in-out 2s infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          <Cloud size={22} className="text-[#7FB8B5]" style={{ opacity: 0.15 }} />
        </div>
      </div>


      {/* Locker Bank - Main Focus */}
      <div className="relative" style={{ perspective: "1200px" }}>
        <div className="flex gap-0 md:gap-16" style={{ transform: "rotateX(4deg) rotateY(-2deg)", transformStyle: "preserve-3d", animation: "lockerFloat 18s ease-in-out infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          {[0, 1, 2].map((lockerIndex) => {
            const isOpen = lockerIndex === 1 && doorOpen;
            return (
              <div key={lockerIndex}
                className={`relative ${lockerIndex === 1 ? "" : "hidden md:block"}`}>
                  <div className="relative w-36 h-36 rounded-2xl flex-shrink-0"
                    style={{
                      background: isOpen
                        ? "linear-gradient(180deg, #1a2d45 0%, #0f1f30 100%)"
                        : "linear-gradient(145deg, #355C8A 0%, #29486A 50%, #1e3a5c 100%)",
                      boxShadow: isOpen
                        ? "inset 0 0 30px rgba(0,0,0,0.4), 0 25px 50px -12px rgba(53,92,138,0.5)"
                        : "0 25px 50px -12px rgba(53,92,138,0.5), inset 0 1px 0 rgba(127,184,181,0.15)",
                      transition: isOpen ? "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
                    }}>
                    {/* Door panel */}
                    <div className="absolute w-20 h-36 rounded-2xl z-10 overflow-hidden"
                      style={{
                        right: "100%",
                        top: 0,
                        background: "linear-gradient(145deg, #355C8A 0%, #29486A 50%, #1e3a5c 100%)",
                        boxShadow: "-4px 0 20px -8px rgba(0,0,0,0.3), 0 25px 50px -12px rgba(53,92,138,0.4)",
                        transform: isOpen ? "perspective(600px) rotateY(12deg)" : "perspective(600px) rotateY(90deg)",
                        opacity: isOpen ? 1 : 0,
                        willChange: "transform",
                        backfaceVisibility: "hidden",
                        transformOrigin: "right center",
                        transition: isOpen ? "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
                        pointerEvents: "none",
                      }}>
                      <div className="absolute top-1/2 left-2 -translate-y-1/2">
                        <div className="w-2.5 h-8 rounded-sm"
                          style={{ background: "linear-gradient(180deg, #4a6f9e, #2a4a6a)", boxShadow: "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" }} />
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 w-1.5"
                        style={{
                          background: "linear-gradient(to left, #4a6f9e, #29486A)",
                          borderRadius: "0 12px 12px 0",
                        }} />
                    </div>
                    {/* Interior content */}
                    <div className="absolute inset-0 rounded-2xl overflow-hidden">
                      <div style={{ opacity: isOpen ? 1 : 0, transition: isOpen ? "opacity 0.3s ease" : "none" }}>
                        <div className="absolute bottom-10 left-3 right-3 h-2 rounded"
                          style={{ background: "linear-gradient(180deg, #2a4565 0%, #1a3050 100%)" }} />
                        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2">
                          <div className="w-16 h-12 rounded-lg shadow-inner"
                            style={{ background: "linear-gradient(135deg, #dce3e8, #b8c9d4)" }} />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-16"
                          style={{ background: "linear-gradient(to top, rgba(127,184,181,0.08), transparent)" }} />
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"
                              style={{ boxShadow: "0 0 8px rgba(251,191,36,0.6)" }} />
                            <span className="text-[8px] text-white/40 font-medium tracking-wider uppercase">Open</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ opacity: isOpen ? 0 : 1, transition: isOpen ? "opacity 0.3s ease" : "none" }}>
                        <div className="absolute inset-2 rounded-xl border border-[#7FB8B5]/15" />
                        <div className="absolute top-4 left-1/2 -translate-x-1/2">
                          <div className="px-3 py-0.5 rounded-md text-[10px] font-bold text-white/70 tracking-wider"
                            style={{ background: "rgba(0,0,0,0.2)" }}>
                            LK-{lockerIndex + 1}
                          </div>
                        </div>
                        <div className="absolute top-11 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="w-6 h-0.5 rounded" style={{ background: "rgba(127,184,181,0.15)" }} />
                          ))}
                        </div>
                        <div className="absolute top-1/2 right-3 -translate-y-1/2">
                          <div className="w-2.5 h-8 rounded-sm"
                            style={{ background: "linear-gradient(180deg, #4a6f9e, #2a4a6a)", boxShadow: "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" }} />
                        </div>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400"
                              style={{ boxShadow: "0 0 8px rgba(74,222,128,0.6)" }} />
                            <span className="text-[8px] text-white/40 font-medium tracking-wider uppercase">Locked</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phone */}
        <div className="absolute left-[92px] -top-8 md:left-[353px] md:-top-10 z-30" style={{ transform: "translateZ(30px)", transformStyle: "preserve-3d", opacity: showPhone ? 1 : 0 }}>
          <div style={{ animation: "float3d 15s ease-in-out 0.8s infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
            <div className="relative">
            <div className="w-14 h-24 bg-[#263747] rounded-2xl shadow-xl relative overflow-hidden border-2 border-[#355C8A]/40">
              <div className="absolute inset-1 rounded-xl bg-gradient-to-b from-[#1a3050] to-[#0f1f30] flex items-center justify-center">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg p-1">
                  <svg className="w-full h-full" viewBox="0 0 21 21">
                    <rect x="0" y="0" width="9" height="9" rx="0.5" fill="#355C8A" />
                    <rect x="12" y="0" width="9" height="9" rx="0.5" fill="#355C8A" />
                    <rect x="0" y="12" width="9" height="9" rx="0.5" fill="#355C8A" />
                    <rect x="1" y="1" width="7" height="7" rx="0.3" fill="white" />
                    <rect x="13" y="1" width="7" height="7" rx="0.3" fill="white" />
                    <rect x="1" y="13" width="7" height="7" rx="0.3" fill="white" />
                    <rect x="2" y="2" width="5" height="5" rx="0.2" fill="#355C8A" />
                    <rect x="14" y="2" width="5" height="5" rx="0.2" fill="#355C8A" />
                    <rect x="2" y="14" width="5" height="5" rx="0.2" fill="#355C8A" />
                    <rect x="10" y="10" width="5" height="5" rx="0.3" fill="#355C8A" />
                    <rect x="10" y="12" width="2" height="2" rx="0.2" fill="white" />
                    <rect x="10" y="10" width="2" height="2" rx="0.2" fill="white" />
                    <rect x="13" y="13" width="2" height="2" rx="0.2" fill="white" />
                    <rect x="12" y="12" width="3" height="3" rx="0.2" fill="white" />
                    <rect x="6" y="6" width="3" height="3" rx="0.3" fill="#355C8A" />
                    <rect x="6" y="10" width="2" height="2" rx="0.2" fill="#355C8A" />
                    <rect x="16" y="10" width="3" height="3" rx="0.3" fill="#355C8A" />
                    <rect x="10" y="16" width="3" height="3" rx="0.3" fill="#355C8A" />
                    <rect x="12" y="3" width="2" height="2" rx="0.2" fill="#355C8A" />
                    <rect x="3" y="10" width="2" height="2" rx="0.2" fill="#355C8A" />
                    <rect x="17" y="6" width="2" height="2" rx="0.2" fill="#355C8A" />
                    <rect x="6" y="17" width="2" height="2" rx="0.2" fill="#355C8A" />
                  </svg>
                </div>
              </div>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#7FB8B5]" />
            </div>
          </div>
          </div>
        </div>

        {/* Student ID Card */}
        <div className="absolute left-[58px] top-[150px] md:left-[305px] md:top-28 z-20" style={{ transform: "translateZ(15px)", transformStyle: "preserve-3d", opacity: showIdCard ? 1 : 0 }}>
          <div style={{ animation: "float3d 15s ease-in-out infinite", willChange: "transform", backfaceVisibility: "hidden" }}>
          <div className="w-40 h-auto bg-white rounded-xl shadow-2xl">
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-4 h-4 rounded bg-[#355C8A]" />
              <span className="text-[7px] text-[#7FB8B5] font-medium">STUDENT</span>
            </div>
            <div className="text-[9px] font-bold text-[#263747] mb-0.5">ALEX WONG</div>
            <div className="text-[7px] text-[#7FB8B5] mb-2">23WMR12345</div>
            <div className="flex gap-[1.5px]">
              {[4,2,1,3,2,4,1,2,3,1,4,2,2,1,3,2,1,4,2,3,1,2,4,1,3,2,1,4,2,1,3,2].map((w, i) => (
                <div key={i} className="bg-[#263747] rounded-[0.5px]" style={{ width: `${w}px`, height: "10px" }} />
              ))}
            </div>
          </div>
          </div>
          </div>
        </div>

        {/* Connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 hidden md:block" style={{ opacity: doorOpen ? 0.45 : 0 }} key={`lines-${Math.floor(timer / 30)}`}>
          <line x1="358" y1="15" x2="136" y2="64" stroke="#7FB8B5" strokeWidth="2" strokeDasharray="6 6" className="animate-line-glow" />
          <line x1="310" y1="140" x2="133" y2="63" stroke="#7FB8B5" strokeWidth="2" strokeDasharray="6 6" className="animate-line-glow" />
          <circle cx="140" cy="62" r="10" fill="none" stroke="#7FB8B5" strokeWidth="0.8">
            <animate attributeName="r" from="6" to="20" dur="8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.5" to="0" dur="8s" repeatCount="indefinite" />
          </circle>
        </svg>

      </div>

      <style>{`
        @keyframes float3d {
          0%, 100% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); }
          25% { transform: translateY(-12px) rotateX(2deg) rotateY(4deg); }
          50% { transform: translateY(-20px) rotateX(-1deg) rotateY(-3deg); }
          75% { transform: translateY(-6px) rotateX(1deg) rotateY(2deg); }
        }
        @keyframes lockerFloat {
          0%, 100% { transform: rotateX(4deg) rotateY(-2deg) translateY(0px); }
          50% { transform: rotateX(2deg) rotateY(0deg) translateY(-10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes dashMove {
          to { stroke-dashoffset: -200; }
        }
        @keyframes linePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .animate-line-glow {
          animation: linePulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
