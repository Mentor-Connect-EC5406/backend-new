-- all mentors charge in LKR, existing bookings keep their own currency
UPDATE mentors SET currency = 'LKR' WHERE currency <> 'LKR';
