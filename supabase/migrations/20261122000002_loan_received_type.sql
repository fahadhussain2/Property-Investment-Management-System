-- Spec 008 §3: money a lender gave the business. A new enum value goes in its own migration file.
alter type public.voucher_type add value 'loan_received';
