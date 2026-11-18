// Isolated access-lifecycle fixture. The ChatKit browser runtime is mocked; no model request.
import ChatKitAssistant from '../../../../../components/ai-assistant/chatkit-assistant';
export default function Page() {
  return <ChatKitAssistant clientId="1" clientName="Fixture client" domainKey="synthetic-domain-key"/>;
}
