-- 012_create_student_feedback_forms.sql
-- Adds managed student feedback form definitions with active/inactive support.
-- Students will only receive the ACTIVE form schema.

begin;

create table if not exists student_feedback_forms (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version integer not null default 1,
  title text not null,
  description text null,
  schema jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate versions per logical key
create unique index if not exists student_feedback_forms_key_version_uidx
  on student_feedback_forms (key, version);

-- Enforce only ONE active form at a time
create unique index if not exists student_feedback_forms_one_active_uidx
  on student_feedback_forms (active)
  where active;

-- Seed default form (active) once (keeps backward compatibility)
insert into student_feedback_forms (key, version, title, description, schema, active)
select
  'student-feedback-v1',
  1,
  'Student Feedback Form',
  'Your feedback helps improve the thesis defense experience. Please answer honestly.',
  $$
  {
    "version": 1,
    "key": "student-feedback-v1",
    "title": "Student Feedback Form",
    "description": "Your feedback helps improve the thesis defense experience. Please answer honestly.",
    "sections": [
      {
        "id": "overall",
        "title": "Overall Experience",
        "questions": [
          {
            "id": "overall_satisfaction",
            "type": "rating",
            "label": "Overall satisfaction with the defense process",
            "scale": { "min": 1, "max": 5, "minLabel": "Poor", "maxLabel": "Excellent" },
            "required": true
          },
          {
            "id": "schedule_clarity",
            "type": "rating",
            "label": "Clarity of schedule, venue, and instructions",
            "scale": { "min": 1, "max": 5, "minLabel": "Unclear", "maxLabel": "Very clear" },
            "required": true
          },
          {
            "id": "notification_timeliness",
            "type": "rating",
            "label": "Timeliness of announcements/notifications (schedule updates, room changes, etc.)",
            "scale": { "min": 1, "max": 5, "minLabel": "Late", "maxLabel": "On time" },
            "required": true
          },
          {
            "id": "time_management",
            "type": "rating",
            "label": "Time management during the defense (start/end, pacing, Q&A time)",
            "scale": { "min": 1, "max": 5, "minLabel": "Poor", "maxLabel": "Excellent" },
            "required": true
          },
          {
            "id": "venue_comfort",
            "type": "rating",
            "label": "Comfort and suitability of the venue for presenting",
            "scale": { "min": 1, "max": 5, "minLabel": "Poor", "maxLabel": "Excellent" },
            "required": false
          }
        ]
      },
      {
        "id": "preparation",
        "title": "Preparation & Support",
        "questions": [
          {
            "id": "rubric_clarity",
            "type": "rating",
            "label": "Clarity of rubric/criteria shared before the defense",
            "scale": { "min": 1, "max": 5, "minLabel": "Unclear", "maxLabel": "Very clear" },
            "required": true
          },
          {
            "id": "adviser_support",
            "type": "rating",
            "label": "Support from adviser prior to the defense",
            "scale": { "min": 1, "max": 5, "minLabel": "Low", "maxLabel": "High" },
            "required": false
          },
          {
            "id": "staff_support",
            "type": "rating",
            "label": "Support from staff/office in preparing requirements (documents, forms, venue guidance)",
            "scale": { "min": 1, "max": 5, "minLabel": "Low", "maxLabel": "High" },
            "required": false
          },
          {
            "id": "prep_time_sufficiency",
            "type": "rating",
            "label": "Sufficiency of time to prepare after schedule was announced",
            "scale": { "min": 1, "max": 5, "minLabel": "Not enough", "maxLabel": "Enough" },
            "required": false
          }
        ]
      },
      {
        "id": "panel",
        "title": "Panel & Feedback Quality",
        "questions": [
          {
            "id": "feedback_helpfulness",
            "type": "rating",
            "label": "Helpfulness of panel feedback",
            "scale": { "min": 1, "max": 5, "minLabel": "Not helpful", "maxLabel": "Very helpful" },
            "required": true
          },
          {
            "id": "feedback_fairness",
            "type": "rating",
            "label": "Fairness and professionalism of evaluation",
            "scale": { "min": 1, "max": 5, "minLabel": "Unfair", "maxLabel": "Very fair" },
            "required": true
          },
          {
            "id": "feedback_clarity",
            "type": "rating",
            "label": "Clarity of comments and recommendations",
            "scale": { "min": 1, "max": 5, "minLabel": "Unclear", "maxLabel": "Very clear" },
            "required": true
          },
          {
            "id": "qa_opportunity",
            "type": "rating",
            "label": "Opportunity to answer questions and clarify points",
            "scale": { "min": 1, "max": 5, "minLabel": "Too little", "maxLabel": "Enough" },
            "required": false
          },
          {
            "id": "respectful_environment",
            "type": "rating",
            "label": "Respectful and supportive environment during the defense",
            "scale": { "min": 1, "max": 5, "minLabel": "Not respectful", "maxLabel": "Very respectful" },
            "required": true
          }
        ]
      },
      {
        "id": "facilities",
        "title": "Facilities & Logistics",
        "questions": [
          {
            "id": "venue_readiness",
            "type": "rating",
            "label": "Venue readiness (room, equipment, setup)",
            "scale": { "min": 1, "max": 5, "minLabel": "Poor", "maxLabel": "Excellent" },
            "required": true
          },
          {
            "id": "audio_visual",
            "type": "rating",
            "label": "Audio/visual support and presentation setup",
            "scale": { "min": 1, "max": 5, "minLabel": "Poor", "maxLabel": "Excellent" },
            "required": true
          },
          {
            "id": "technical_support",
            "type": "rating",
            "label": "Technical support availability when issues occur (projector, audio, files, connectivity)",
            "scale": { "min": 1, "max": 5, "minLabel": "Not available", "maxLabel": "Very available" },
            "required": false
          }
        ]
      },
      {
        "id": "open_ended",
        "title": "Suggestions",
        "questions": [
          {
            "id": "what_went_well",
            "type": "text",
            "label": "What went well during the defense?",
            "placeholder": "Share what worked best...",
            "required": false,
            "maxLength": 1000
          },
          {
            "id": "most_helpful_feedback",
            "type": "text",
            "label": "What was the most helpful feedback you received?",
            "placeholder": "Share the most useful comment/recommendation...",
            "required": false,
            "maxLength": 1000
          },
          {
            "id": "what_to_improve",
            "type": "text",
            "label": "What should be improved?",
            "placeholder": "Share suggestions...",
            "required": false,
            "maxLength": 1000
          },
          {
            "id": "other_comments",
            "type": "text",
            "label": "Other comments",
            "placeholder": "Anything else you want to add...",
            "required": false,
            "maxLength": 1000
          }
        ]
      }
    ]
  }
  $$::jsonb,
  true
where not exists (select 1 from student_feedback_forms);

commit;
