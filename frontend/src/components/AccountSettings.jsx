import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';

const AccountSettings = ({ userId, onLogout }) => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState({
    email: '',
    password: '',
    profession: '',
    hobbies: '',
    interests: '',
    skill_level: '',
    additional_info: '',
    gender: 'neutral'
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`http://localhost:5000/users/${userId}`);
      const data = await response.json();
      setUserData({ ...data, password: '' });
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user data');
    }
  };

  const handleChange = (e) => {
    setUserData({
      ...userData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:5000/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        setMessage('Account information updated successfully!');
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update account information');
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      setError('Failed to update account information');
    }
  };

  return (
    <div className="container" style={{ position: 'relative', padding: '20px' }}>
      <HomeButton />
      <LogoutButton onLogout={onLogout} />
      
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
        <h1 style={{ color: '#5DADE2', textAlign: 'center' }}>Account Settings</h1>
        
        {message && <div className="message">{message}</div>}
        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit} className="form-group">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={userData.email}
              disabled
            />
          </div>

          <div className="form-group">
            <label>New Password (leave blank to keep current)</label>
            <input
              type="password"
              name="password"
              value={userData.password}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Profession</label>
            <input
              type="text"
              name="profession"
              value={userData.profession}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Hobbies</label>
            <input
              type="text"
              name="hobbies"
              value={userData.hobbies}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Interests</label>
            <input
              type="text"
              name="interests"
              value={userData.interests}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Skill Level</label>
            <select
              name="skill_level"
              value={userData.skill_level}
              onChange={handleChange}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div className="form-group">
            <label>Additional Information</label>
            <textarea
              name="additional_info"
              value={userData.additional_info}
              onChange={handleChange}
              rows="4"
            />
          </div>

          <button type="submit" style={{ width: '100%', marginTop: '20px' }}>
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccountSettings; 