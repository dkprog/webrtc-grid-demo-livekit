interface ProducerCountProps {
  count: number;
}

export function ProducerCount({ count }: ProducerCountProps) {
  return (
    <p className="text-lg font-medium mb-6">
      {count} producer{count === 1 ? '' : 's'} connected
    </p>
  );
}
