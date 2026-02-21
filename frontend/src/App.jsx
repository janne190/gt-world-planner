import WorldCanvas from "./WorldCanvas";
import "./App.css";

function App() {
  return (
    <div className="app">
      <h1>GT World Planner</h1>
      <p className="subtitle">100×60 grid &middot; ws://localhost:8080</p>
      <WorldCanvas />
    </div>
  );
}

export default App;
