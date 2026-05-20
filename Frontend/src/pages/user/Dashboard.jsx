import React, { useState } from 'react';
import { History, Zap, Wallet, BarChart2, QrCode, MapPin, Clock, AlertCircle, Hash } from 'lucide-react';
import StatsCard from '../../components/ui/StatsCard';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import QRScanner from '../../components/ui/QRScanner';
import ManualChargerInput from '../../components/ui/ManualChargerInput';
import { useTheme } from '../../contexts/ThemeContext';
import { useData } from '../../contexts/DataContext';
import { API_ENDPOINTS } from '../../config/config';

const UserDashboard = () => {
  const { theme } = useTheme();
  const { user } = useData();
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [isStartingCharge, setIsStartingCharge] = useState(false);
  const [chargeStatus, setChargeStatus] = useState(null);

  const stats = {
    sessions: { total: 24 },
    consumedUnits: "345 kWh",
    spending: { total: "₹4,328" },
    avgSessionTime: "42 min",
  };

  const handleQRScanSuccess = async (chargerId) => {
    console.log('Starting charge for charger:', chargerId);
    setIsStartingCharge(true);
    
    try {
      // Call API to start charging session
      const response = await fetch(`${API_ENDPOINTS.TRANSACTIONS.BASE}/start-test-charge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          chargerId: chargerId,
          amount: 1, // 1 rupee test charge
          userId: user?.id || user?._id
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setChargeStatus({
          type: 'success',
          message: `Test charging session started for charger ${chargerId}`,
          transactionId: result.transactionId
        });
      } else {
        throw new Error(result.message || 'Failed to start charging session');
      }
    } catch (error) {
      console.error('Error starting charge:', error);
      setChargeStatus({
        type: 'error',
        message: error.message || 'Failed to start charging session'
      });
    } finally {
      setIsStartingCharge(false);
    }
  };

  const handleStartCharging = () => {
    setIsQRScannerOpen(true);
    setChargeStatus(null);
  };

  const handleManualInput = () => {
    setIsManualInputOpen(true);
    setChargeStatus(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">User Dashboard</h1>
        <div className="flex gap-2">
          <Button 
            onClick={handleManualInput}
            variant="outline"
            leftIcon={<Hash size={20} />}
          >
            Enter ID
          </Button>
          <Button 
            onClick={handleStartCharging}
            className="bg-green-600 hover:bg-green-700 text-white"
            leftIcon={<QrCode size={20} />}
          >
            Scan QR
          </Button>
        </div>
      </div>

      {/* Charge Status Alert */}
      {chargeStatus && (
        <div className={`p-4 rounded-lg border ${
          chargeStatus.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {chargeStatus.type === 'success' ? (
              <Zap size={20} className="text-green-600" />
            ) : (
              <AlertCircle size={20} className="text-red-600" />
            )}
            <span className="font-medium">{chargeStatus.message}</span>
          </div>
          {chargeStatus.transactionId && (
            <p className="text-sm mt-1 opacity-75">
              Transaction ID: {chargeStatus.transactionId}
            </p>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Sessions" 
          value={stats.sessions.total.toString()}
          icon={<History size={24} />}
          color="blue"
          footer="Last 30 days"
        />
        
        <StatsCard 
          title="Energy Consumed" 
          value={stats.consumedUnits}
          icon={<Zap size={24} />}
          color="green"
          footer="Total consumption"
        />
        
        <StatsCard 
          title="Total Spending" 
          value={stats.spending.total}
          icon={<Wallet size={24} />}
          color="purple"
          footer="All time"
        />
        
        <StatsCard 
          title="Avg. Session Time" 
          value={stats.avgSessionTime}
          icon={<BarChart2 size={24} />}
          color="orange"
          footer="Per session"
        />
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Button 
            onClick={handleStartCharging}
            className="bg-green-600 hover:bg-green-700 text-white p-6 h-auto flex flex-col items-center gap-3"
            disabled={isStartingCharge}
          >
            <QrCode size={32} />
            <div className="text-center">
              <div className="font-semibold">Scan QR Code</div>
              <div className="text-sm opacity-90">Camera scanning</div>
            </div>
          </Button>

          <Button 
            onClick={handleManualInput}
            variant="outline"
            className="p-6 h-auto flex flex-col items-center gap-3"
            disabled={isStartingCharge}
          >
            <Hash size={32} />
            <div className="text-center">
              <div className="font-semibold">Enter Charger ID</div>
              <div className="text-sm opacity-75">Manual input</div>
            </div>
          </Button>
          
          <Button 
            variant="outline"
            className="p-6 h-auto flex flex-col items-center gap-3"
          >
            <MapPin size={32} />
            <div className="text-center">
              <div className="font-semibold">Find Stations</div>
              <div className="text-sm opacity-75">Locate nearby chargers</div>
            </div>
          </Button>
          
          <Button 
            variant="outline"
            className="p-6 h-auto flex flex-col items-center gap-3"
          >
            <History size={32} />
            <div className="text-center">
              <div className="font-semibold">View History</div>
              <div className="text-sm opacity-75">Check past sessions</div>
            </div>
          </Button>
        </div>
      </Card>
      
      {/* Sessions Summary */}
      <Card title="Charging Sessions">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-300">Total Sessions</p>
            <p className="text-xl font-semibold text-gray-800 dark:text-white">{stats.sessions.total}</p>
          </div>
          <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-300">Completed</p>
            <p className="text-xl font-semibold text-gray-800 dark:text-white">21</p>
          </div>
          <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-300">In Progress</p>
            <p className="text-xl font-semibold text-gray-800 dark:text-white">3</p>
          </div>
        </div>
      </Card>
      
      {/* Recent Transactions */}
      <Card title="Recent Transactions">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Station</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { date: "2025-05-01", station: "EV Station Alpha", units: "24 kWh", amount: "₹320", status: "Completed" },
                { date: "2025-04-28", station: "QuickCharge Beta", units: "18 kWh", amount: "₹240", status: "Completed" },
                { date: "2025-04-25", station: "PowerHub Station", units: "32 kWh", amount: "₹420", status: "Completed" },
                { date: "2025-04-22", station: "EcoCharge Point", units: "15 kWh", amount: "₹195", status: "Completed" },
                { date: "2025-04-20", station: "Test Charger", units: "0.1 kWh", amount: "₹1", status: "Test" },
              ].map((tx, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{tx.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{tx.station}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{tx.units}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{tx.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      tx.status === 'Test' 
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Usage Insights */}
      <Card title="Usage Insights">
        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
          <p>Chart visualizations coming soon</p>
        </div>
      </Card>

      {/* QR Scanner Modal */}
      <QRScanner 
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanSuccess={handleQRScanSuccess}
      />

      {/* Manual Charger Input Modal */}
      <ManualChargerInput 
        isOpen={isManualInputOpen}
        onClose={() => setIsManualInputOpen(false)}
        onStartCharge={handleQRScanSuccess}
      />
    </div>
  );
};

export default UserDashboard;