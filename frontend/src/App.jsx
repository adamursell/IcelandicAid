import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';
import GenerateFlashcards from './components/GenerateFlashcards';
import FlashcardLibrary from './components/FlashcardLibrary';
import PracticeSetup from './components/PracticeSetup';
import PracticeSession from './components/PracticeSession';
import ConversationalPractice from './components/ConversationalPractice';
import AccountSettings from './components/AccountSettings';
import LearnerProgress from './components/LearnerProgress';

const App = () => {
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Check for existing auth data on initial load
    const storedUserId = localStorage.getItem('userId');
    const storedUserEmail = localStorage.getItem('userEmail');
    
    if (storedUserId && storedUserEmail) {
      setUserId(storedUserId);
      setUserEmail(storedUserEmail);
      console.log("User authenticated from localStorage:", { userId: storedUserId });
    } else {
      console.log("No user auth found in localStorage");
    }
  }, []);

  const handleLogin = (id, email) => {
    setUserId(id);
    setUserEmail(email);
    localStorage.setItem('userId', id);
    localStorage.setItem('userEmail', email);
    console.log("User logged in:", { userId: id, email });
  };

  const handleLogout = () => {
    setUserId(null);
    setUserEmail('');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    console.log("User logged out");
  };

  // Log when the router is rendered
  console.log("Rendering App router with routes");

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/" 
            element={
              userId ? (
                <Navigate to="/home" replace />
              ) : (
                <Login onLogin={handleLogin} />
              )
            } 
          />
          <Route path="/register" element={<Register />} />
          <Route 
            path="/home" 
            element={
              userId ? (
                <Home 
                  userEmail={userEmail} 
                  userId={userId} 
                  onLogout={handleLogout}
                />
              ) : (
                <Navigate to="/" />
              )
            } 
          />
          <Route path="/generate" element={<GenerateFlashcards userId={userId} onLogout={handleLogout} />} />
          <Route path="/library" element={<FlashcardLibrary userId={userId} onLogout={handleLogout} />} />
          
          {/* Practice Routes - Make sure these are consistent */}
          <Route path="/practice" element={<Navigate to="/practice/setup" replace />} />
          <Route path="/practice/setup" element={<PracticeSetup />} />
          <Route path="/practice-session" element={<PracticeSession />} />
          
          <Route 
            path="/conversation" 
            element={<ConversationalPractice userId={userId} onLogout={handleLogout} />} 
          />
          <Route 
            path="/account" 
            element={
              userId ? (
                <AccountSettings 
                  userId={userId} 
                  onLogout={handleLogout}
                />
              ) : (
                <Navigate to="/" />
              )
            } 
          />
          <Route 
            path="/progress" 
            element={
              userId ? (
                <LearnerProgress 
                  userId={userId} 
                  onLogout={handleLogout}
                />
              ) : (
                <Navigate to="/" />
              )
            } 
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App; 