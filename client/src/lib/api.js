export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem('token'));

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API}/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
  return data;
}

// File luôn đi qua route có kiểm tra quyền. <img>/<video> không gửi được header nên dùng ?token=
export const fileUrl = (messageId, download = false) =>
  `${API}/api/files/${messageId}?token=${getToken()}${download ? '&download=1' : ''}`;
