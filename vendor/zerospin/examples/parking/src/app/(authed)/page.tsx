import { Navbar } from './Navbar';
import { ParkingDashboard } from './ParkingDashboard';

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <ParkingDashboard />
    </div>
  );
}
