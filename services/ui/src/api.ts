import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({ baseURL: BASE });

// Sources
export const getSources = () => api.get('/sources').then(r => r.data.data);
export const createSource = (d: any) => api.post('/sources', d).then(r => r.data.data);
export const updateSource = (id: string, d: any) => api.put(`/sources/${id}`, d).then(r => r.data.data);
export const deleteSource = (id: string) => api.delete(`/sources/${id}`);

// Apify settings
export const getApifySettings = () => api.get('/apify/settings').then(r => r.data.data);
export const createApifySettings = (d: any) => api.post('/apify/settings', d).then(r => r.data.data);
export const updateApifySettings = (id: string, d: any) => api.put(`/apify/settings/${id}`, d).then(r => r.data.data);
export const deleteApifySettings = (id: string) => api.delete(`/apify/settings/${id}`);
export const testApifyConnection = (d: any) => api.post('/apify/test-connection', d).then(r => r.data);

// Runs
export const getRuns = () => api.get('/apify/runs').then(r => r.data.data);
export const triggerRun = (d: any) => api.post('/apify/run', d).then(r => r.data.data);

// Properties
export const getProperties = (params?: any) => api.get('/properties', { params }).then(r => r.data);
