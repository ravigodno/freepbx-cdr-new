export async function saveCallProcessStatus({
  uniqueid,
  token,
  comment,
  processed,
  src,
  calldate,
}: {
  uniqueid: string;
  token: string;
  comment: string;
  processed: boolean;
  src: string;
  calldate: string;
}) {
  return fetch(`/api/calls/${uniqueid}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      comment,
      processed,
      src,
      calldate,
    }),
  });
}
