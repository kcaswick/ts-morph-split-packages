import * as fs from "fs-extra";
import { ICruiseResult } from "dependency-cruiser";

export type IConfigJson = {
  OldPatterns: Record<string, Location>;
};

type IMadgeDependencies = Record<string, string[]>;

function isICruiseResult(o: unknown): o is ICruiseResult {
  return typeof o === "object" && o !== null && "modules" in o && "summary" in o;
}

export type ILocation = {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number;
};

class Location implements ILocation {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number | undefined;
  /**
   *
   */
  constructor(source: ILocation) {
    this.Repo = source.Repo ?? "";
    this.Package = source.Package ?? "";
    this.Path = source.Path ?? "";
    this.Order = source.Order ?? 0;
  }

  public toString = () =>
    `${this.Package === this.Repo ? "" : `"${this.Package}"`}${this.Repo}:${this.Path}`;
}

export type IMapResult = {
  OldName: string;
  New?: Location;
};

export class MapResult implements IMapResult {
  OldName: string;
  New?: Location;

  /**
   *
   */
  constructor(source: IMapResult) {
    this.OldName = source.OldName;
    this.New = source.New;
  }

  public isUnmapped = () => this.New === undefined;

  public toString = () => `${this.OldName}${this.isUnmapped() ? " (unmapped)" : ` => ${this.New}`}`;
}

export class Config {
  OldPatterns = new Map<string, Location>();
  BranchPrefix = "split/";
}

// TODO: Switch to using this class for mappings
export class Dependency {
  Name: MapResult;
  dependencyMap: MapResult[] = [];
  /**
   *
   */
  constructor({
    Name,
    dependencyMap: dependencies,
  }: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }) {
    this.Name = Name;
    this.dependencyMap = dependencies;
  }

  public toString = (): string =>
    `${this.Name} has ${
      this.dependencyMap.length > 0 ? this.dependencyMap.length : "no "
    }dependencies [${this.dependencyMap.map((d) => d.toString()).join(", ")}]`;
}

export class PackageMapping {
  config = new Config();
  depMap: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }[] = [];

  invdepMap: {
    Name: MapResult;
    dependentMap: MapResult[];
  }[] = [];

  public export() {
    let output = this.depMap.map(($_) => ({
      OldName: $_.Name.OldName,
      NewRepo: $_.Name.New?.Repo,
      NewPackage: $_.Name.New?.Package,
      NewName: $_.Name.New?.Path,
      "Dependency Count": $_.dependencyMap.length,
      "Package Dependencies": $_.dependencyMap
        .map(($_) => $_.New?.Package ?? "N/A")
        .sort()
        .filter((value, index, self) => self.indexOf(value) === index)
        .filter((value) => value !== $_.Name.New?.Package),
      dependencies: $_.dependencyMap.map(($_) =>
        undefined === $_.New ? $_.OldName : $_.New?.Repo + ":" + $_.New?.Path
      ),
    }));
    output = output.sort((a, b) =>
      (`${a.NewRepo}${a.NewName}` ?? a.OldName ?? "").localeCompare(
        `${b.NewRepo}${b.NewName}` ?? b.OldName
      )
    );

    return JSON.stringify(output, undefined, 2);
  }

  public exportPackageDependenciesChart(): IMadgeDependencies {
    const output: IMadgeDependencies = {};
    this.depMap.forEach((x) => {
      const packageName =
        (x.Name.New?.Package === "N/A" ? x.Name.New?.Repo : x.Name.New?.Package) ?? "N/A";
      output[packageName] ??= [];
      x.dependencyMap
        .map((d) => (d.New?.Package === "N/A" ? d.New?.Repo : d.New?.Package) ?? "(unmapped)")
        .filter((d) => d !== packageName)
        .filter(
          (value, index, self) =>
            self.indexOf(value) === index &&
            !output[packageName].find((already) => value === already)
        )
        .forEach((d) => output[packageName].push(d));
    });

    return output;
  }

  public inverseDependencies(dependencyList: Record<string, string[]>) {
    const dependents: Record<string, string[]> = {};
    Object.entries(dependencyList).forEach((p) => {
      p[1].forEach((_: string | number) => {
        dependents[_] ??= [];
        dependents[_].push(p[0]);
      });
    });
    return dependents;
  }

  public mapPackage(oldPath: string): Location | undefined {
    for (const oldPattern of this.config.OldPatterns.keys()) {
      let target: ILocation | undefined;
      if (
        new RegExp(oldPattern).test(oldPath) &&
        (target = this.config.OldPatterns.get(oldPattern))
      ) {
        const nw: Location = new Location(target);
        nw.Path = oldPath.replace(oldPattern, nw.Path ?? "");
        return nw;
      }
    }

    return undefined;
  }

  public getPackageMap(
    dependencyJsonPath = "doc/dependency.json",
    configPath = "./PackageMap.json"
  ) {
    const packageMap: IConfigJson = fs.readJsonSync(configPath);

    const dependenciesJson: IMadgeDependencies | ICruiseResult =
      fs.readJsonSync(dependencyJsonPath);

    const dep2: Record<string, string[]> = isICruiseResult(dependenciesJson)
      ? Object.fromEntries(
          dependenciesJson.modules
            .filter(
              (s) =>
                s &&
                !(
                  s.source.startsWith("node_modules") ||
                  s.source.startsWith("@") ||
                  s.source.endsWith(".css")
                )
            )
            .map((m) => [
              m.source,
              m.dependencies
                .map((d) => d.resolved)
                .filter(
                  (s) =>
                    s && !(s.startsWith("node_modules") || s.startsWith("@") || s.endsWith(".css"))
                ) ?? [],
            ])
            .values()
        )
      : dependenciesJson;

    const dependents = this.inverseDependencies(dep2);

    Object.entries(packageMap.OldPatterns)
      .sort((a, b) => (a[1].Order ?? 0) - (b[1].Order ?? 0))
      .forEach((x) => this.config.OldPatterns.set(...x));

    this.depMap = Object.entries(dep2).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependencyMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    this.invdepMap = Object.entries(dependents).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependentMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    return this;
  }
}
