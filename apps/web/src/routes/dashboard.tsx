export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Overview</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-6 bg-white rounded-xl border shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Audits</h3>
          <p className="text-2xl font-bold">128</p>
        </div>
      </div>
    </div>
  );
}
