-- ADMIN account (the only way to create one, see CLAUDE.md); the admin logs in through Asgardeo
INSERT INTO users (id, external_auth_id, email, first_name, last_name, role, account_status)
VALUES ('85242b23-29fe-4ddd-8dd7-273bce96c2be', '85242b23-29fe-4ddd-8dd7-273bce96c2be', 'admin4@gmail.com', 'Platform', 'Admin', 'ADMIN', 'ACTIVE');
