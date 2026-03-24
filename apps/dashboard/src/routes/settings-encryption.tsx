import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onecli/ui/components/card";
import { Button } from "@onecli/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onecli/ui/components/select";
import { PageHeader } from "@/components/page-header";

export function SettingsEncryptionPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 max-w-5xl">
      <PageHeader
        title="Encryption"
        description="Configure how your secrets are encrypted."
      />
      <Card>
        <CardHeader>
          <CardTitle>Key Management</CardTitle>
          <CardDescription>
            Select which Key Management System to use for encrypting your
            project data
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Select defaultValue="default">
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default OneCLI KMS</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" className="w-fit" disabled>
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
