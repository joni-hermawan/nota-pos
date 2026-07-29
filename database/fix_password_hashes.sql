/* Perbaikan: mengganti placeholder password_hash dengan bcrypt hash asli.
   Password untuk semua user di bawah ini: password123
   GANTI password ini setelah login pertama kali di lingkungan produksi. */

UPDATE users SET password_hash = '$2b$10$2.fEgnqjcCseOb7vqlRSA.iPa5r2sHxj6OKTv0DrKmUDZxUEUTWya' WHERE username = 'admin01';
UPDATE users SET password_hash = '$2b$10$KopEvUjqro1aiyacZK8lneD2xJl/SMm4561NKyZlBv5lfLm37CwTy' WHERE username = 'kasir01';
UPDATE users SET password_hash = '$2b$10$MDX52nYbYReUx/NgBBKl4eqIY8XGS0.Fq5b9R7uRZQ0JVRYtJJSpi' WHERE username = 'ppic01';
UPDATE users SET password_hash = '$2b$10$Tyv8iuRD9eh/umTApXCNtOT7auuXMQVnUvC541Gp4ilHATmzK2zKq' WHERE username = 'finance01';

-- Verifikasi
SELECT username, name, role, LEFT(password_hash, 10) AS hash_preview FROM users;
