import DLQ from './components/DLQ';
import VideoGrid from './components/VideoGrid';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<VideoGrid />} />
        <Route path="/dlq" element={<DLQ />} />  
      </Routes>
    </Router>
  );
}

export default App;
