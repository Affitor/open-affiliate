export default function ContentLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="dark bg-[#0a0a0a] text-white min-h-screen">{children}</div>;
}
