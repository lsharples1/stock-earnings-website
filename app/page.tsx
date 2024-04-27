import Earnings from "./components/earnings";

export default function Home() {


  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1 className="text-5xl font-bold text-center">
        Earnings Report Generator
      </h1>
      <Earnings />
    </main>
  );
}
