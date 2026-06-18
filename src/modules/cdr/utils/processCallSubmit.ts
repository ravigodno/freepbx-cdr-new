import { saveCallProcessStatus } from '../services/cdrProcessApi';

export async function processCallSubmit({
  selectedCall,
  session,
  commentInput,
  isProcessedInput,
  handleAuthError,
  reloadData,
  setSelectedCall,
  setIsSavingProcess,
}: {
  selectedCall: any;
  session: any;
  commentInput: string;
  isProcessedInput: boolean;
  handleAuthError: (resp: Response) => void;
  reloadData: () => void;
  setSelectedCall: (call: any | null) => void;
  setIsSavingProcess: (value: boolean) => void;
}) {
  if (!selectedCall || !session) return;

  setIsSavingProcess(true);

  try {
    const resp = await saveCallProcessStatus({
      uniqueid: selectedCall.uniqueid,
      token: session.token,
      comment: commentInput,
      processed: isProcessedInput,
      src: selectedCall.src,
      calldate: selectedCall.calldate,
    });

    if (resp.status === 401) {
      handleAuthError(resp);
      return;
    }

    if (resp.ok) {
      setSelectedCall(null);
      reloadData();
    } else {
      alert('Не удалось записать статус звонка в базу данных.');
    }
  } catch (e) {
    alert('Сбой сетевой отправки статуса вызова.');
  } finally {
    setIsSavingProcess(false);
  }
}
