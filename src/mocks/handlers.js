import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/mock-login', async ({ request }) => {
    const { email, password } = await request.json();

    // 模擬驗證邏輯
    if (email === 'admin@visionary.test' && password === 'admin123') {
      return HttpResponse.json({
        token: 'fake.jwt.token.admin.999',
        user: { username: 'admin', role: 'admin' }
      });
    }

    if (email === 'user@visionary.test' && password === 'user123') {
      return HttpResponse.json({
        token: 'fake.jwt.token.user.111',
        user: { username: 'user', role: 'user' }
      });
    }

    // 帳密錯誤
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }),
];
