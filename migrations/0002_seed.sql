-- ADMIN account (the only way to create one, see CLAUDE.md); the password is not stored anywhere in the repo
INSERT INTO users (id, external_auth_id, email, password_hash, first_name, last_name, role, account_status)
VALUES ('85242b23-29fe-4ddd-8dd7-273bce96c2be', '85242b23-29fe-4ddd-8dd7-273bce96c2be', 'admin4@gmail.com', 'pbkdf2$100000$b4f395df27e91f85d5c8a44166643129$cbb331919eb5818a93ac6fe724c473a599d270ff89e46935d4d4d9d4b321fedf', 'Platform', 'Admin', 'ADMIN', 'ACTIVE');
