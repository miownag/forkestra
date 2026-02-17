type MenuEventCallback = () => void;

class MenuEventBus {
  private listeners: Map<string, Set<MenuEventCallback>> = new Map();

  on(event: string, callback: MenuEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string): void {
    this.listeners.get(event)?.forEach((callback) => callback());
  }
}

export const menuEventBus = new MenuEventBus();
