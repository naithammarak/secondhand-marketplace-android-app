import { useLocalSearchParams } from 'expo-router';
import { InspectorWorkScreen } from '@/components/staff/inspector-work';
export default function InspectorWorkRoute() {
  const { inspectionId } = useLocalSearchParams<{ inspectionId?: string }>();
  return <InspectorWorkScreen inspectionId={inspectionId} />;
}
