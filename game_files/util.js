function assert(value, msg = "Assertion failed!") {
    if(!value) throw new Error(msg);
    return value;
}
function is_num(value) {
    return typeof value === "number" && !Number.isNaN(value);
}

function assert_num(value) {
    assert(is_num(value), "Value is not number");
    return value;
}
