import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../config';
import './AdminFeedback.css';

const AdminFeedback = () => {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    type: '',
    startDate: '',
    endDate: ''
  });
  
  const navigate = useNavigate();
  
  useEffect(() => {
    fetchFeedback();
  }, []);
  
  const fetchFeedback = async () => {
    try {
      setLoading(true);
      
      // Build query string from filters
      const queryParams = new URLSearchParams();
      if (filters.type) queryParams.append('type', filters.type);
      if (filters.startDate) queryParams.append('start_date', filters.startDate);
      if (filters.endDate) queryParams.append('end_date', filters.endDate);
      
      const queryString = queryParams.toString();
      const url = `${config.API_URL}/admin/feedback${queryString ? `?${queryString}` : ''}`;
      
      const response = await axios.get(url);
      
      if (response.data.success) {
        setFeedback(response.data.feedback);
        setError('');
      } else {
        setError('Failed to fetch feedback data');
      }
    } catch (err) {
      console.error('Error fetching feedback:', err);
      if (err.response && err.response.status === 401) {
        setError('You are not authorized to view this page');
      } else if (err.response && err.response.status === 403) {
        setError('Admin access required');
      } else {
        setError('Failed to load feedback data');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };
  
  const applyFilters = (e) => {
    e.preventDefault();
    fetchFeedback();
  };
  
  const resetFilters = () => {
    setFilters({
      type: '',
      startDate: '',
      endDate: ''
    });
    // Fetch without filters
    fetchFeedback();
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  const getFeedbackTypeOptions = () => {
    // Get unique feedback types from the data
    const types = [...new Set(feedback.map(item => item.feedback_type))];
    return types.map(type => (
      <option key={type} value={type}>{type}</option>
    ));
  };
  
  if (loading) {
    return <div className="admin-loading">Loading feedback data...</div>;
  }
  
  if (error) {
    return (
      <div className="admin-error">
        <p>{error}</p>
        <button onClick={() => navigate('/home')}>Return to Home</button>
      </div>
    );
  }
  
  return (
    <div className="admin-feedback-container">
      <h1>User Feedback Administration</h1>
      
      <div className="admin-filters">
        <h3>Filter Feedback</h3>
        <form onSubmit={applyFilters}>
          <div className="filter-row">
            <div className="filter-group">
              <label>Feedback Type:</label>
              <select 
                name="type" 
                value={filters.type} 
                onChange={handleFilterChange}
              >
                <option value="">All Types</option>
                {getFeedbackTypeOptions()}
              </select>
            </div>
            
            <div className="filter-group">
              <label>Start Date:</label>
              <input 
                type="date" 
                name="startDate" 
                value={filters.startDate} 
                onChange={handleFilterChange} 
              />
            </div>
            
            <div className="filter-group">
              <label>End Date:</label>
              <input 
                type="date" 
                name="endDate" 
                value={filters.endDate} 
                onChange={handleFilterChange} 
              />
            </div>
          </div>
          
          <div className="filter-buttons">
            <button type="submit">Apply Filters</button>
            <button type="button" onClick={resetFilters}>Reset Filters</button>
          </div>
        </form>
      </div>
      
      <div className="feedback-stats">
        <p>Total feedback items: <strong>{feedback.length}</strong></p>
      </div>
      
      <div className="feedback-list">
        {feedback.length === 0 ? (
          <p className="no-feedback">No feedback found with the selected filters.</p>
        ) : (
          feedback.map(item => (
            <div key={item.id} className="feedback-item">
              <div className="feedback-header">
                <span className="feedback-type">{item.feedback_type}</span>
                <span className="feedback-date">{formatDate(item.created_at)}</span>
              </div>
              
              <div className="feedback-content">
                <p>{item.feedback_text}</p>
              </div>
              
              <div className="feedback-user">
                {item.user_email ? (
                  <span>From: {item.user_email}</span>
                ) : (
                  <span>From: Anonymous User</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      <button className="back-button" onClick={() => navigate('/home')}>
        Back to Home
      </button>
    </div>
  );
};

export default AdminFeedback; 