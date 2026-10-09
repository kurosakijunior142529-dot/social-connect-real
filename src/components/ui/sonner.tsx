import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group vibely-toaster"
      offset={14}
      gap={8}
      visibleToasts={2}
      duration={2200}
      {...props}
      richColors={false}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "vibely-toast mx-auto flex w-fit max-w-[88vw] items-center gap-2.5 rounded-full px-4 py-2.5 text-[14px] font-medium text-foreground",
          title: "leading-tight",
          description: "text-xs text-muted-foreground",
          icon: "vibely-toast-icon shrink-0",
          actionButton: "ml-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground",
          cancelButton: "ml-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground",
          error: "vibely-toast-error",
          success: "vibely-toast-success",
        },
      }}
    />
  );
};

export { Toaster };
