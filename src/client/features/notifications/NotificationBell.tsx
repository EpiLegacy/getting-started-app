import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Badge, Box, IconButton, List, ListItem, ListItemText, Popover, Typography } from '@mui/material';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import type { NotificationFeed } from '../../../modules/notifications/types';
import { visuallyHidden } from '../../lib/visuallyHidden';
import { notificationsApi } from './api';
import { bellLabel, formatTime, newArrival } from './feed';

/**
 * Notifications come from the worker, asynchronously: polling keeps the bell
 * simple, and a card moved to Completed shows up within a few seconds.
 */
const POLL_MS = 5000;

export default function NotificationBell() {
  const [feed, setFeed] = useState<NotificationFeed>({ notifications: [], unread: 0 });
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // RGAA 7.5: a notification that arrives while the page is open is announced.
  const [announcement, setAnnouncement] = useState('');
  const newestSeen = useRef<string | undefined>(undefined);
  const popoverId = useId();
  const titleId = useId();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await notificationsApi.list(signal);
      const arrival = newArrival(newestSeen.current, next);
      if (arrival) setAnnouncement(arrival);
      newestSeen.current = next.notifications[0]?.id ?? '';
      setFeed(next);
    } catch {
      // A failed poll keeps the last state and the next one retries. An
      // expired session is handled by request() itself.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [load]);

  async function open(event: React.MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
    if (feed.unread === 0) return;
    // The list keeps its "New" marks until the next poll, so the user still
    // sees which ones just arrived.
    setFeed(current => ({ ...current, unread: 0 }));
    try {
      await notificationsApi.markAllRead();
    } catch {
      // The next poll brings the unread count back.
    }
  }

  const label = bellLabel(feed.unread);

  return (
    <>
      <Box role="status" aria-live="polite" sx={visuallyHidden}>{announcement}</Box>
      <IconButton
        color="inherit"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor ? 'true' : 'false'}
        aria-controls={anchor ? popoverId : undefined}
        onClick={event => void open(event)}
      >
        <Badge badgeContent={feed.unread} color="error" max={99}>
          <NotificationsOutlinedIcon />
        </Badge>
      </IconButton>
      <Popover
        id={popoverId}
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { width: 360, maxWidth: 'calc(100vw - 32px)' } },
        }}
      >
        <Typography id={titleId} component="h2" variant="subtitle1" fontWeight={700} sx={{ px: 2, pt: 2, pb: 1 }}>
          Notifications
        </Typography>
        {feed.notifications.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
            No notifications yet. Move a task to Completed to get one.
          </Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 400, overflowY: 'auto' }}>
            {feed.notifications.map(notification => (
              <ListItem key={notification.id} divider>
                <ListItemText
                  primary={notification.body}
                  secondary={`${notification.read ? '' : 'New · '}${formatTime(notification.createdAt)}`}
                  slotProps={{ primary: { fontWeight: notification.read ? 400 : 700 } }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
