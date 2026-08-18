type ShimmerProps = {
  className?: string;
};

const Shimmer = ({ className }: ShimmerProps) => (
  <span
    aria-hidden="true"
    className={`looper-shimmer block rounded-md${className ? ` ${className}` : ""}`}
  />
);

export default Shimmer;
