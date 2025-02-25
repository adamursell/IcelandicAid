import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';
import GenerateFlashcards from './components/GenerateFlashcards';
import FlashcardLibrary from './components/FlashcardLibrary';
import PracticeSetup from './components/PracticeSetup';
import PracticeSession from './components/PracticeSession';

const App = () => {
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    const storedUserEmail = localStorage.getItem('userEmail');
    if (storedUserId && storedUserEmail) {
      setUserId(storedUserId);
      setUserEmail(storedUserEmail);
    }
  }, []);

  const handleLogin = (id, email) => {
    setUserId(id);
    setUserEmail(email);
    localStorage.setItem('userId', id);
    localStorage.setItem('userEmail', email);
  };

  const handleLogout = () => {
    setUserId(null);
    setUserEmail('');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
  };

  return (
    <Router>
      <div className="App">
        <Switch>
          <Route path="/" exact>
            {userId ? <Home userEmail={userEmail} onLogout={handleLogout} /> : <Login onLogin={handleLogin} />}
          </Route>
          <Route path="/register" component={Register} />
          <Route path="/home">
            <Home userEmail={userEmail} onLogout={handleLogout} />
          </Route>
          <Route path="/generate">
            <GenerateFlashcards userId={userId} onLogout={handleLogout} />
          </Route>
          <Route path="/library">
            <FlashcardLibrary userId={userId} onLogout={handleLogout} />
          </Route>
          <Route path="/practice" exact>
            <PracticeSetup onLogout={handleLogout} />
          </Route>
          <Route path="/practice/session">
            <PracticeSession userId={userId} onLogout={handleLogout} />
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

export default App; 