import { render, screen } from '@testing-library/react';
import App from './App';

test('menampilkan halaman loading saat aplikasi dimulai', () => {
  render(<App />);
  expect(screen.getByText(/memuat/i)).toBeInTheDocument();
});
