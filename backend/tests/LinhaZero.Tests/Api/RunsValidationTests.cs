
namespace LinhaZero.Tests;

public class RunsValidationTests
{
    private static readonly GridHeader Grid = new("guimaraes", -20700, 205700, 100, 157, 152);
    private static readonly RunRequest Ok = new("guimaraes", new(103, 92), new(45, 2.5), 240, new(200, 20, 25, 2035), new([], []));

    [Fact]
    public void A_valid_request_passes() => Assert.Null(RunRequestParser.Validate(Ok, Grid));

    [Fact]
    public void Unknown_grid() => Assert.Contains("desconhecida", RunRequestParser.Validate(Ok with { Grid = "nada" }, null));

    [Theory]
    [InlineData(0)]
    [InlineData(501)]
    public void Runs_out_of_range(int runs) => Assert.Contains("ensemble.runs", RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { Runs = runs } }, Grid));

    [Theory]
    [InlineData(59)]
    [InlineData(1441)]
    public void Duration_out_of_range(int min) => Assert.Contains("durationMin", RunRequestParser.Validate(Ok with { DurationMin = min }, Grid));

    [Fact]
    public void Wind_out_of_range()
    {
        Assert.Contains("speedMs", RunRequestParser.Validate(Ok with { Wind = new(45, 20.5) }, Grid));
        Assert.Contains("speedMs", RunRequestParser.Validate(Ok with { Wind = new(45, double.NaN) }, Grid));
        Assert.Contains("directionDeg", RunRequestParser.Validate(Ok with { Wind = new(360, 2) }, Grid));
        Assert.Contains("directionDeg", RunRequestParser.Validate(Ok with { Wind = new(-1, 2) }, Grid));
    }

    [Fact]
    public void Ignition_outside_the_grid()
    {
        Assert.Contains("fora da grelha", RunRequestParser.Validate(Ok with { Ignition = new(157, 0) }, Grid));
        Assert.Contains("fora da grelha", RunRequestParser.Validate(Ok with { Ignition = new(0, 152) }, Grid));
        Assert.Contains("fora da grelha", RunRequestParser.Validate(Ok with { Ignition = new(-1, 0) }, Grid));
        Assert.Null(RunRequestParser.Validate(Ok with { Ignition = new(156, 151) }, Grid));
    }

    [Fact]
    public void Jitters_out_of_range()
    {
        Assert.Contains("windDirJitterDeg", RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindDirJitterDeg = 181 } }, Grid));
        Assert.Contains("windDirJitterDeg", RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindDirJitterDeg = -1 } }, Grid));
        Assert.Contains("windSpeedJitterPct", RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindSpeedJitterPct = 101 } }, Grid));
        Assert.Null(RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindDirJitterDeg = 0, WindSpeedJitterPct = 0 } }, Grid));
    }

    [Fact]
    public void Non_finite_numbers_are_rejected_everywhere()
    {
        Assert.NotNull(RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindDirJitterDeg = double.PositiveInfinity } }, Grid));
        Assert.NotNull(RunRequestParser.Validate(Ok with { Ensemble = Ok.Ensemble with { WindSpeedJitterPct = double.NaN } }, Grid));
        Assert.NotNull(RunRequestParser.Validate(Ok with { Wind = new(double.NaN, 2) }, Grid));
        Assert.NotNull(RunRequestParser.Validate(Ok with { Wind = new(45, double.NegativeInfinity) }, Grid));
        Assert.NotNull(RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0)], double.PositiveInfinity)], []) }, Grid));
        Assert.NotNull(RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0)], 0, double.NaN)], []) }, Grid));
        // 1e308 is finite but out of range; 1e309 overflows to infinity when parsed. Both must be 400s (the reviewer's wedge case).
        foreach (var literal in new[] { "1e308", "1e309" })
        {
            var (_, r) = RunRequestParser.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contracts", "run-request.json")).Replace("\"windDirJitterDeg\": 20", $"\"windDirJitterDeg\": {literal}"));
            Assert.Contains("windDirJitterDeg", RunRequestParser.Validate(r, Grid));
        }
    }

    [Fact]
    public void Cells_outside_the_grid_are_rejected()
    {
        Assert.Contains("fora da grelha", RunRequestParser.Validate(Ok with { Decisions = new([], [new([new(-5, 99999)])]) }, Grid));
        Assert.Contains("fora da grelha", RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0), new(157, 0)])], []) }, Grid));
        Assert.Null(RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0), new(156, 151)], 30, 0.2, "suppression")], []) }, Grid));
        Assert.Contains("rateFactor", RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0)], 30, 1.5)], []) }, Grid));
        Assert.Contains("startMin", RunRequestParser.Validate(Ok with { Decisions = new([new([new(0, 0)], -1)], []) }, Grid));
    }

    [Fact]
    public void Null_interventions_or_cells_are_rejected()
    {
        Assert.Contains("nulas", RunRequestParser.Validate(Ok with { Decisions = new([null!], []) }, Grid));
        Assert.Contains("decisão B", RunRequestParser.Validate(Ok with { Decisions = new([], [new([new(0, 0), null!])]) }, Grid));
        var body = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contracts", "run-request.json"));
        var (_, a) = RunRequestParser.Parse(body.Replace("\"B\": []", "\"B\": [null]"));
        Assert.Contains("nulas", RunRequestParser.Validate(a, Grid));
        var (_, c) = RunRequestParser.Parse(body.Replace("{ \"row\": 106, \"col\": 88 },", "null,"));
        Assert.Contains("nulas", RunRequestParser.Validate(c, Grid));
        Assert.Contains("nulas", RunRequestParser.Validate(c, null)); // before the grid check, so a 400 never becomes a 500
    }

    [Fact]
    public void Too_many_cells_or_interventions()
    {
        var huge = new InterventionCells(Enumerable.Repeat(new Cell(0, 0), 157 * 152 + 1).ToList());
        Assert.Contains("mais células", RunRequestParser.Validate(Ok with { Decisions = new([], [huge]) }, Grid));
        var many = Enumerable.Repeat(new InterventionCells([new(0, 0)], Kind: "containmentLine"), 51).ToList();
        Assert.Contains("mais de 50", RunRequestParser.Validate(Ok with { Decisions = new(many, []) }, Grid));
        Assert.Null(RunRequestParser.Validate(Ok with { Decisions = new(many.Take(50).ToList(), []) }, Grid));
    }

    [Fact]
    public void Kind_end_and_backfire_cells_are_checked()
    {
        string? Check(InterventionCells iv) => RunRequestParser.Validate(Ok with { Decisions = new([iv], []) }, Grid);
        List<Cell> cells = [new(10, 10), new(10, 11)];
        Assert.Contains("tipo desconhecido", Check(new(cells)));
        Assert.Contains("tipo desconhecido", Check(new(cells, Kind: "napalm")));
        Assert.Null(Check(new(cells, 30, Kind: "aerialDrop", EndMin: 50)));
        Assert.Null(Check(new(cells, 30, 0.2, "suppression", EndMin: 90)));
        Assert.Contains("endMin", Check(new(cells, 30, Kind: "aerialDrop", EndMin: 30)));
        Assert.Contains("endMin", Check(new(cells, 30, Kind: "aerialDrop", EndMin: 1441)));
        Assert.Contains("endMin", Check(new(cells, 30, Kind: "aerialDrop", EndMin: double.NaN)));
        Assert.Null(Check(new(cells, 30, Kind: "backfire", LitCells: [new(9, 10), new(9, 11)])));
        Assert.Contains("litCells", Check(new(cells, 30, Kind: "backfire")));
        Assert.Contains("litCells", Check(new(cells, 30, Kind: "backfire", LitCells: [new(157, 0)])));
        Assert.Contains("litCells", Check(new(cells, 30, Kind: "backfire", LitCells: [null!])));
    }
}
