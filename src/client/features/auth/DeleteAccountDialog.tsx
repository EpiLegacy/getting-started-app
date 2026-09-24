import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';
import { useAuth } from './AuthProvider';
import { errorMessage } from '../../lib/http';

export default function DeleteAccountDialog({ onClose }: { onClose(): void }) {
    const { deleteAccount } = useAuth();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await deleteAccount(password);
        } catch (cause) {
            setError(errorMessage(cause));
            setBusy(false);
        }
    }

    return (
        <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth
            aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
            <form onSubmit={submit}>
                <DialogTitle id="delete-account-title">Permanently delete your account?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-account-description" sx={{ mb: 2 }}>
                        This permanently deletes your account and every task you own, including claimed tasks.
                        You will be signed out on all devices. This cannot be undone.
                    </DialogContentText>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField label="Current password" type="password" autoComplete="current-password"
                        autoFocus required fullWidth disabled={busy} value={password}
                        slotProps={{ htmlInput: { maxLength: 128 } }}
                        onChange={event => setPassword(event.target.value)} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button type="submit" color="error" variant="contained" disabled={busy || !password}>
                        {busy ? 'Deleting…' : 'Delete permanently'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
