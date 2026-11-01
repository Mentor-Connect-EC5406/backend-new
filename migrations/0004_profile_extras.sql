-- extended profile sections are saved as JSON, skills are searched
ALTER TABLE mentors ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mentors ADD COLUMN profile_extras TEXT NOT NULL DEFAULT '{}';
ALTER TABLE student_profiles ADD COLUMN profile_extras TEXT NOT NULL DEFAULT '{}';

-- student interests change from free text to a JSON array
UPDATE student_profiles SET interests = json_array(interests)
WHERE interests IS NOT NULL
  AND CASE WHEN json_valid(interests) THEN json_type(interests) <> 'array' ELSE 1 END;
