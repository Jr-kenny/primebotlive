import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface HeroProps {
  onStartSession: () => void;
}

const Hero = ({ onStartSession }: HeroProps) => {
  return (
    <section className="min-h-[85vh] flex flex-col items-center justify-center text-center px-6 relative">
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="relative z-10 max-w-2xl"
      >
        {/* Status pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-secondary/50 mb-10"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs font-mono text-muted-foreground">Agent Online</span>
        </motion.div>

        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground leading-[0.95] mb-6">
          PRIMEBOT
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto mb-12 leading-relaxed">
          Verify before you execute.<br />
          DeFi decisions that think first.
        </p>

        <Button
          variant="hero"
          size="lg"
          onClick={onStartSession}
          className="px-10 py-6 text-sm"
        >
          Start Session →
        </Button>
      </motion.div>
    </section>
  );
};

export default Hero;
