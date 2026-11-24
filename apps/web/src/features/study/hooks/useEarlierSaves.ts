// Whether an earlier study session of this tab still has changes to write (it was left without a connection): a new
// one waits for them, and then reads the student's progress again.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { studyKeys } from '../../progress/queries';
import { earlierSaves } from '../api/SaveQueue';

export function useEarlierSaves(): boolean {
  const client = useQueryClient();
  const [saves] = useState(earlierSaves);
  const [waiting, setWaiting] = useState(saves !== null);
  useEffect(() => {
    if (!saves) return;
    let live = true;
    void saves
      .then(() => client.resetQueries({ queryKey: studyKeys.all }))
      .then(() => {
        if (live) setWaiting(false);
      });
    return () => {
      live = false;
    };
  }, [saves, client]);
  return waiting;
}
