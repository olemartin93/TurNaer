type Tone = "info" | "warning" | "error";

const tones: Record<Tone, string> = {
  info: "bg-fjord-50 text-fjord-700 border-fjord-600/20",
  warning: "bg-cloudberry-100 text-cloudberry-800 border-cloudberry-500/30",
  error: "bg-lingon-50 text-lingon-700 border-lingon-700/20",
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
