import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DragArea } from "@/components/ui/drag-area";
import { SkillCard } from "@/components/skills/skill-card";
import { SkillDetailDialog } from "@/components/skills/skill-detail-dialog";
import { SkillInstallDialog } from "@/components/skills/skill-install-dialog";
import { useSelectorSkillsStore } from "@/stores";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ArrowLeft2, Refresh, Add } from "iconsax-reactjs";
import type { SkillConfig } from "@/types";

export const Route = createFileRoute("/skills")({
  component: RouteComponent,
});

type SkillSection = "discovered" | "installed";

interface SectionItem {
  id: SkillSection;
  label: string;
}

const SECTION_ITEMS: SectionItem[] = [
  { id: "discovered", label: "Discovered" },
  { id: "installed", label: "Installed" },
];

function RouteComponent() {
  const {
    skills,
    isLoading,
    isScanning,
    fetchSkills,
    scanSkills,
    toggleSkill,
    installSkill,
    removeSkill,
  } = useSelectorSkillsStore([
    "skills",
    "isLoading",
    "isScanning",
    "fetchSkills",
    "scanSkills",
    "toggleSkill",
    "installSkill",
    "removeSkill",
  ]);

  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SkillSection>("discovered");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<SkillConfig | null>(null);

  const sectionRefs = useRef<Map<SkillSection, HTMLDivElement>>(new Map());

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute(
              "data-section"
            ) as SkillSection;
            if (section) {
              setActiveSection(section);
            }
          }
        });
      },
      { threshold: 0.3, rootMargin: "-20% 0px -60% 0px" }
    );

    sectionRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      sectionRefs.current.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, [skills]);

  const scrollToSection = (section: SkillSection) => {
    const element = sectionRefs.current.get(section);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(section);
    }
  };

  const discoveredSkills = skills.filter((s) => s.source.type !== "user_installed");
  const installedSkills = skills.filter((s) => s.source.type === "user_installed");

  // Group discovered skills by source
  const groupedDiscovered = discoveredSkills.reduce<
    Record<string, SkillConfig[]>
  >((groups, skill) => {
    let key: string;
    if (skill.source.type === "global") {
      key = `${skill.source.agent} Global`;
    } else if (skill.source.type === "project") {
      key = `${skill.source.agent} Project: ${skill.source.project_path}`;
    } else {
      key = "Other";
    }
    (groups[key] ??= []).push(skill);
    return groups;
  }, {});

  const handleView = useCallback((skill: SkillConfig) => {
    setViewingSkill(skill);
    setDetailDialogOpen(true);
  }, []);

  const handleRemove = useCallback(
    async (skill: SkillConfig) => {
      const global = skill.source.type === "global" || skill.source.type === "user_installed";
      const agent =
        skill.source.type === "global"
          ? skill.source.agent
          : skill.source.type === "project"
            ? skill.source.agent
            : undefined;
      await removeSkill(skill.name, global, agent);
    },
    [removeSkill]
  );

  return (
    <>
      <DragArea />
      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="flex gap-8 w-full max-w-7xl">
          {/* Left Sidebar */}
          <div className="w-56 shrink-0 py-12 sticky top-0 h-[calc(100vh-3.25rem)] overflow-y-auto">
            <Button
              variant="ghost"
              onClick={() => router.history.back()}
              className="[&_svg]:size-5 w-full justify-start pl-2 mb-6 text-base"
            >
              <ArrowLeft2 />
              Back
            </Button>

            <nav className="space-y-1">
              {SECTION_ITEMS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-[0.85rem] rounded-md transition-colors cursor-pointer",
                    activeSection === section.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-8 sm:w-2xl md:w-3xl py-12">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Skills</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Manage agent skills for your sessions
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="[&_svg]:size-3"
                  onClick={scanSkills}
                  disabled={isScanning}
                >
                  <Refresh className={cn(isScanning && "animate-spin")} />
                  Scan
                </Button>
              </div>

              {/* Discovered Section */}
              <div
                ref={(el) => {
                  if (el) sectionRefs.current.set("discovered", el);
                }}
                data-section="discovered"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">Discovered</h3>
                  <p className="text-sm text-muted-foreground">
                    Skills found in your agent configuration directories
                  </p>
                </div>

                {isLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    Loading...
                  </div>
                ) : discoveredSkills.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                    No skills discovered. Click "Scan" to search your
                    configuration directories.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedDiscovered).map(
                      ([groupLabel, groupSkills]) => (
                        <div key={groupLabel}>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            {groupLabel}
                          </p>
                          <div className="space-y-2">
                            {groupSkills.map((skill) => (
                              <SkillCard
                                key={skill.id}
                                skill={skill}
                                onToggle={toggleSkill}
                                onView={handleView}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Installed Section */}
              <div
                ref={(el) => {
                  if (el) sectionRefs.current.set("installed", el);
                }}
                data-section="installed"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Installed</h3>
                    <p className="text-sm text-muted-foreground">
                      Skills installed via the CLI
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="[&_svg]:size-4"
                    onClick={() => setInstallDialogOpen(true)}
                  >
                    <Add />
                    Install Skill
                  </Button>
                </div>

                {installedSkills.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                    No user-installed skills yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {installedSkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        onToggle={toggleSkill}
                        onView={handleView}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SkillDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        skill={viewingSkill}
      />

      <SkillInstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        onInstall={installSkill}
      />
    </>
  );
}
