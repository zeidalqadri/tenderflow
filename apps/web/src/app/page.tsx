export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          TenderFlow
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Comprehensive Tender Management Platform
        </p>
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-2">Features</h2>
            <ul className="text-left space-y-2 text-gray-700">
              <li>• Automated document parsing with OCR</li>
              <li>• Per-tender user assignments</li>
              <li>• Real-time collaboration</li>
              <li>• Integrated workflow management</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}