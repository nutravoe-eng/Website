-- Add 'pending' to subscription_status enum.
-- Required for flexible-wallet subscriptions that await admin approval before activation.
alter type subscription_status add value if not exists 'pending';
