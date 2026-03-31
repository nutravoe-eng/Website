export const metadata = {
  title: 'Nutravoe Studio',
  description: 'Admin Dashboard for Nutravoe',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
