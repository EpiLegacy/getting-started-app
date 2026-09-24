import { useEffect, useState } from 'react';
import type { Task } from '../../../modules/tasks/types';
import { ApiError, errorMessage } from '../../lib/http';
import { itemsApi } from './api/itemsApi';

export function useTasks() {
    const [items, setItems] = useState<Task[]>([]);
    const [unassigned, setUnassigned] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const [revision, setRevision] = useState(0);
    const invalidate = () => setRevision(value => value + 1);
    const refresh = () => { setError(''); invalidate(); };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        Promise.all([itemsApi.getAll(controller.signal), itemsApi.getUnassigned(controller.signal)])
            .then(([mine, available]) => {
                if (controller.signal.aborted) return;
                setItems(mine);
                setUnassigned(available);
            }).catch(cause => {
                if (!controller.signal.aborted) setError(errorMessage(cause));
            }).finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [revision]);

    async function mutate(action: () => Promise<unknown>) {
        setPending(true);
        setError('');
        try {
            await action();
            refresh();
        } catch (cause) {
            setError(errorMessage(cause));
            // Another user may have won a claim or another tab deleted a task.
            if (cause instanceof ApiError && [404, 409].includes(cause.status)) invalidate();
        } finally { setPending(false); }
    }
    return { items, unassigned, loading, error, pending, refresh, mutate };
}
