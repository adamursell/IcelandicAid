import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    profession: '',
    hobbies: '',
    interests: '',
    skillLevel: 'beginner',
    gender: 'neutral',
    additionalInfo: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://127.0.0.1:5000/register', formData);
      setMessage(response.data.message);
      setError('');
      // Redirect to login after successful registration
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setError('This email is already registered. Please use a different email.');
      } else {
        setError('Registration failed: ' + (err.response?.data?.message || 'Unknown error'));
      }
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1 style={{ color: '#5DADE2' }}>Icelandic Learning Aid</h1>
      <h2>Register</h2>
      {message && <div className="message">{message}</div>}
      {error && <div className="error">{error}</div>}
      
      <form onSubmit={handleRegister} style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div className="form-group">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <input
            type="text"
            name="profession"
            placeholder="Your Profession"
            value={formData.profession}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <input
            type="text"
            name="hobbies"
            placeholder="Your Hobbies"
            value={formData.hobbies}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <input
            type="text"
            name="interests"
            placeholder="Your Interests"
            value={formData.interests}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <select
            name="skillLevel"
            value={formData.skillLevel}
            onChange={handleChange}
            required
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="form-group">
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div className="form-group">
          <textarea
            name="additionalInfo"
            placeholder="Preferred practice areas and any other information you'd like to share"
            value={formData.additionalInfo}
            onChange={handleChange}
            rows="4"
            required
          />
        </div>

        <button type="submit">Register</button>
      </form>
      <p>Already have an account? <Link to="/">Login here</Link></p>
    </div>
  );
};

export default Register; 